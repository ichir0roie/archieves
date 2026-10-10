# バックエンド(`source/back`)

## 形

| 置き場所 | 中身 |
| --- | --- |
| `app/main.py` | FastAPI の app。CORS・例外ハンドラ・`/api/v1` の router を付ける |
| `app/api/v1/endpoints/` | エンドポイント。引数を受け、crud・services を呼び、コミットして返すだけにする |
| `app/api/deps.py` | `get_session`・`get_current_user`・`get_or_404` |
| `app/crud/` | 表ごとの読み書き(`game.py` は game・round・end・point)。SQL はここに置く |
| `app/services/` | いくつもの表にまたがる処理(旧アプリのバックアップの取り込み) |
| `app/schemas/` | 要求・応答の pydantic のモデル |
| `app/db/models/` | SQLAlchemy のモデル。`app/db/base.py` が全部を読み込む(Alembic 用) |
| `app/core/` | 設定(`config.py`)・認証(`security.py`)・例外(`errors.py`)・点数や的の決まり |
| `alembic/` | マイグレーション |
| `mods/factory_db/` | factory_boy の factory。テストとデバッグで行を作る |
| `debug/` | デバッグ用のスクリプト(下の「debug のスクリプト」) |
| `tools/` | 開発の道具。`python -m tools.<名前>` で回す(`dev`・`dump_openapi`・`testing_db`、データの移行) |

## セッションとコミット

- セッションは引数も変数も `s`(`s: Session = Depends(deps.get_session)`、`with SessionLocal() as s:`)
- crud・services はコミットしない。書いたら `s.flush()` までにし、エンドポイントが最後に `s.commit()` する。いくつもの crud をまとめて一つのトランザクションにするため
- 一部だけを巻き戻したいときは `with s.begin_nested():` を使い、`s.rollback()` で呼び出し側の分まで捨てない(例: `crud/user.py` の `get_or_create_user`、`services/legacy_import.py`)
- `try: ... finally: s.close()` や `except: s.rollback()` は書かない。`with SessionLocal() as s:` の `close()` がコミットしていない分を巻き戻す
- 書いたのにコミットせずに応答するエンドポイントは、テストの `client` が落とす

## クエリ

- SQLAlchemy 2.x の書き方にする。`select()` を組み、`s.scalar()`(1 件)・`s.scalars()`(行の一覧)・`s.execute()`(列の組)で実行する。レガシーの `s.query()` と `.filter()` は使わない
- 集計(件数・合計・平均・中央値・順位)は SQL で行い、行を Python に引いて数えない(`crud/statistics.py`。中央値は `percentile_cont`)

## エラー

- エンドポイントは try/except で HTTPException に詰め替えない。`app/core/errors.py` の例外ハンドラが返す形に変える:

| 例外 | 応答 |
| --- | --- |
| `NotFoundError`(`get_or_404` が投げる) | 404 `{"detail": ...}` |
| `ValueError`(`LegacyImportError` など、ドメインの検証) | 400 `{"detail": ...}` |
| pydantic の `ValidationError`(ハンドラの中で起きたもの) | 500。要求の値ではなくコードの不具合なので 400 にしない |

- 409・422 のように別の状態を返すときだけ `HTTPException` を使う
- 要求の形の検証(型・必須)は FastAPI が 422 で返す。モデルの `Field`・`field_validator` に書く

## スキーマ

- 要求は `XCreate` / `XUpdate`(`XUpdate` は全部の欄を任意にし、`model_dump(exclude_unset=True)` で送られた欄だけを書く)
- 応答は `app/schemas/base.py` の `ResponseModel` を継ぐ(`class GameRead(GameBase, ResponseModel)`)。ORM の行から作れ(`from_attributes`)、既定値の欄も OpenAPI で必須として出る。継ぎ忘れると、フロントの型で `average_score?: number | null` のように任意の欄になる

## OpenAPI とフロントの型

- フロントの型(`source/front/src/lib/api/openapi.d.ts`)は、API の OpenAPI から作る。API の要求・応答・パスを変えたら、両方を作り直してコミットする:

```
cd source/back && .venv/bin/python -m tools.dump_openapi
cd source/front && npm run types
```

- `tests/test_openapi.py` が、`openapi.json` の作り直し忘れを落とす

## 認証

- `AUTH_MODE=cognito`(既定)は、`authenticated_router` の下のすべてに Cognito の ID トークンを求める(`app/core/security.py`)。`mock` は `MOCK_USER_*` の利用者として通す。どちらにするかは import した時に決まる
- エンドポイントは「本人のみ」「本人以外も」「管理者のみ」に分ける。どれも Cognito の ID トークンが通っていること(上の `authenticated_router`)が前提で、「本人のみ」はさらに行の持ち主が本人であることを求める

| 区分 | 対象 | 見るもの |
| --- | --- | --- |
| 本人のみ | `games`・`rounds`・`ends`・`points`・コメントの読み書き全部、`trash/*`、`PATCH /users/{user_id}`、`/users/me`・`/users/me/ensure`・`/import`・`/export/records.db`、`/feedbacks` | トークンの `sub` の利用者の行(`deps.get_me`)と、行の `user_id` が同じこと |
| 本人以外も | `/statistics/*`(ランキング含む)、`GET /users/{user_id}`、`GET /users/{sub}/profile`、`/organizations/*`、`/announcements` | トークンが通っていること |
| 管理者のみ | `/admin/*`(全員の意見 `GET /admin/feedbacks`、返信 `PUT /admin/feedbacks/{feedback_id}/reply`) | 本人の行の `users.is_admin` が true であること(`deps.get_admin`。違えば 403) |

- 「本人のみ」の書き方: 引数に `me: User = Depends(deps.get_me)` を足す。行を引くところは `deps.get_or_404` ではなく `deps.get_own_or_404(me, ...)`(持ち主が違えば 403)。`user_id` を要求で受けるところは `deps.require_self(me, user_id)`、絞り込みの `user_id`(省略可)は `deps.resolve_user_id(me, user_id)`(省略したら本人、他人なら 403)
- 利用者の行がまだ無いトークンは、「本人のみ」で 404(`User not found`)になる。先に `/users/me/ensure` で作る
- 「本人以外も」に game 配下(`games`〜`points`・コメント)の読み取りは入れない。他人に見せる範囲を広げるときは、この表も直す
- `GET/POST /users` は持ち主のいない操作なので、どちらにも分けず、トークンが通れば使える(フロントは使っていない)
- 新しいエンドポイントを足したら、どの区分かを決めて `tests/test_ownership.py` に足す
- 管理者は画面からは決めない。db の行を直に書き換える(`UPDATE users SET is_admin = true WHERE sub = '<Cognito の sub>';`)。`is_admin` は本人の行(`GET /users/me`・`/users/me/ensure` の `MeRead`)にだけ載せ、他人の行(`UserRead`)には出さない
- テストの `client` は `current_user`(`TEST_CLAIMS` の `sub` の利用者)がいる状態。他人の行は `factories` で作る。利用者の行が無い状態は `unregistered_client`

## モデルとマイグレーション

- モデルとマイグレーションは PostgreSQL に向けて書く(本番は RDS for PostgreSQL)。テストも PostgreSQL で回す
- 列を変えたら、開発用の db(`archieves_dev`)に向けてマイグレーションを作り、中身を読んで直してから流す:

```
cd source/back
export DATABASE_URL=$(../../infra_local/postgres.sh)
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m alembic revision --autogenerate -m "add records table"
.venv/bin/python -m alembic upgrade head
```

- `tests/test_migrations.py` が、モデルとマイグレーションの食い違いを落とす
- 本番へのマイグレーションは手で流す(`docs/インフラ/データベース/ローカル開発からのRDSアクセス.md`)

## debug のスクリプト

- `debug/` の多く(`debug/api/run_debug_server.py`・`debug/db/randomize/random_all_data.py`・`debug/db/setup/setup_debug_user.py`)は、`.vscode/launch.json` の「Python Debugger: Current File」からだけ起こす。cwd と `PYTHONPATH` がプロジェクトのルートになるので、`app.*`・`mods.*` をそのまま import する。`sys.path.insert` の決まり文句を足さない
- `debug/test_env/run_test_api_server.py` はシェルから直に回すので、例外としてその決まり文句を持つ(消すと cwd 次第で import が落ちる)
- `tools/` は `source/back` を cwd にして `python -m tools.<名前>` で回すので、決まり文句は要らない

## デプロイ

- `.build/Dockerfile` が Lambda(Lambda Web Adapter)の image。`requirements.txt`(ハッシュ付き)を入れる。起動する ASGI アプリは CMD で決まり、マイグレーションの Lambda は同じ image で `app.migration_app:app` に差し替える
- 本番の Lambda は NAT のない VPC の中にあるので、Cognito の公開鍵を取りに行けない。`AUTH_MODE=proxy` で、フロントの route handler が確かめた利用者を `x-archieves-user-*` ヘッダーで受ける(`API_KEYS` が必須)。db へは `DB_IAM_AUTH=true` の IAM データベース認証で繋ぐ
- `infra/`(CDK)が ECR・Lambda・CI のロールを持ち、GitHub Actions(`.github/workflows/deploy-api.yml`)が image の差し替えとマイグレーションを行う。手順は `docs/インフラ/デプロイ.md`
