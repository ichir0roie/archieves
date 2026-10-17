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
| `ForbiddenError`(`get_own_or_404`・`require_self` が投げる) | 403 `{"detail": ...}` |
| `UnprocessableError`(値がドメインの決まりに合わない。的が出せない点数・決まっていない的の種類。`core/target_types.py` の `check_*`) | 422 `{"detail": ...}`。`ValueError` の子なので、pydantic の validator の中で投げれば要求の形の検証の 422 になる |
| `ValueError`(`LegacyImportError` など、ドメインの検証) | 400 `{"detail": ...}` |
| pydantic の `ValidationError`(ハンドラの中で起きたもの) | 500。要求の値ではなくコードの不具合なので 400 にしない |

- 上の表に無い状態(409 など)を返すときだけ `HTTPException` を使う。crud・services からは `HTTPException` を投げない
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

- `AUTH_MODE=cognito`(既定)は、画面からのログインに Cognito の ID トークンを求める(`app/core/security.py`)。`mock` は `MOCK_USER_*` の利用者として通す(`Bearer mock-token-<sub>` なら、その sub の利用者。E2E が他人の行を作るため)。どちらにするかは import した時に決まる
- 利用者が発行するトークン(`arc_...`。Claude Code などに渡す)は、どの `AUTH_MODE` でも `x-archieves-access-token` ヘッダーで受け、API が db(`access_tokens` の sha256)で確かめる。フロントの route handler が `Authorization: Bearer arc_...` をこのヘッダーに載せ替える。トークンは本人の記録を読む GET と、AI コメントを書く口(`PUT /games/{game_id}/ai-comment`)だけに通す
- `authenticated_router` の入り口(`deps.authenticate`)は、ログインかトークンのどちらかがあることだけを求める。どちらを通すかは、エンドポイントごとに次の依存で決める(`app/api/deps.py`)。新しいエンドポイントには必ずどれかを付ける(`tests/test_ownership.py` の `test_every_endpoint_declares_who_it_lets_in` が付け忘れを落とす)

| 依存 | 通すもの | 使うところ |
| --- | --- | --- |
| `deps.get_reader` | 画面からログインした本人と、本人が発行したトークン | 本人の記録を読む GET: `games`(`/games/{game_id}/sheet`・`/games/sheets` を含む)・`rounds`・`ends`・`points`・コメント・`trash/*`・`/statistics/*`・`/diaries`・`GET /users/me`・`/export/records.db`。`tests/test_ownership.py` の `TOKEN_READABLE_ROUTES` に並べる |
| `deps.require_access_token` | 本人が発行したトークンだけ(画面からのログインは 401) | `POST /mcp`。`tests/test_ownership.py` の `TOKEN_ONLY_ROUTES` に並べる |
| `deps.get_ai_commenter` | 本人が発行したトークンだけ(画面からのログインは 403)。トークンの名前を書いた人として残す | `PUT /games/{game_id}/ai-comment`。`tests/test_ownership.py` の `TOKEN_WRITABLE_ROUTES` に並べる |
| `deps.get_me` | 画面からログインした本人(トークンは 403) | 上の書き込み全部、`PATCH/DELETE /users/me`、`/import`、`/feedbacks`、`/access-tokens` |
| `deps.get_admin` | 画面からログインした管理者(`users.is_admin`。違えば 403) | `/admin/*` |
| `deps.get_browser_claims` | 画面からのログイン(利用者の行が無くてもよい) | `/users/me/ensure`、`POST /error-reports`、`/organizations/*`、`/announcements` |
| `deps.get_optional_me` | ログインしていない人も。トークンは 403 | `/public/*`(`authenticated_router` の外) |

- 本人の行(持ち主)は要求で受けない。`user_id` をクエリ・パス・本文に置かず、上の依存が返す本人(`me`)を使う。行を引くところは `deps.get_own_or_404(me, ...)`(持ち主が違えば 403)
- 他人を見る画面は `/public/*` に置く。利用者の行とジョインし、持ち主の公開範囲が見る人(ログインしていなければ None)に見せる分だけを返す。他人の利用者は `PublicUserRead`(sub・公開範囲・`is_admin` を載せない)で返す
  - `GET /public/scores`: スコアの公開ページ。本人のゲームと、`score_visibility` が見せる相手のゲームだけ(`crud/game.py` の `list_shared_game_sheets`)。見せないものは、無いものと区別せずに外す
  - `GET /public/users/{user_id}/profile`: プロフィール。`profile_visibility` が見せないなら 403(`deps.require_profile_visible`)。基本情報・所属の組織と直近 100 ゲームの集計を返し、直近 10 ゲームの id は `score_visibility`、直近 10 件の日記は `diary_visibility` が見せる相手(と本人)にだけ載せ、ほかは null にする(`crud/profile.py`)
  - `GET /public/ranking`: `ranking_visibility` が見せる相手の分だけを数える(`crud/user.py` の `visible_condition`)。本人も例外にしない(非公開なら本人のランキングにも載らない)
- 公開範囲: `users.profile_visibility`・`users.ranking_visibility`・`users.score_visibility`・`users.diary_visibility`(`private` / `organization` / `public`、既定は `private`。`app/core/visibility.py`)。`organization` は同じ `organization_id` の利用者にだけ見せる(所属の無い人どうし・ログインしていない人には見えない)。公開範囲は本人の行(`MeRead`)にだけ載せる
- 利用者の行がまだ無いログインは、`get_me`・`get_reader` で 404(`Current user not registered`。`app/core/errors.py` の `CURRENT_USER_NOT_REGISTERED`)になる。他人の行が無いときの `User not found` と分け、フロントはこれを受けると登録の画面へ送る。先に `/users/me/ensure` で作る
- トークン(`/access-tokens`): 発行・一覧・失効は画面からログインした本人だけ。平文は発行の応答にだけ載せ、db には sha256 と見分け用の頭だけを置く。期限は 1〜365 日(既定 90)、一人 10 本まで(越えたら 409)。失効は行ごと消す
- AI コメント(`game_ai_comments`): Claude Code などが本人のトークンで、ゲームに一つ書く指摘・改善点(書き直すと上書き)。読むのは `GameSheetRead.ai_comment`、消すのは本人の画面から(`DELETE /games/{game_id}/ai-comment`)。スコアの公開ページには載せない。Claude Code は `GET /games/sheets`(`recorded_on` でその日、`until`・`limit` で直近 N 件の記録を丸ごと)を読んで書く。画面では読む・消すだけにする
- AI から使う口: 利用者がリポジトリも Skill も持たずに、AI に繋いで頼むだけで動くようにする。使い方は API の側が渡す(`app/agent/`)
  - MCP(`POST /api/v1/mcp`、`app/agent/mcp.py`): Streamable HTTP の POST に JSON で答える(SSE・セッションは持たない)。トークンだけで通す(`deps.require_access_token`)。ツールはこの API の REST を中から呼び直すので、トークンで通る範囲も検証も REST と同じ。使い方は initialize の `instructions`(`mcp.md`+`records.md`)とツールの説明で渡す。ツールを足すときは `TOOLS` に足す
  - ヘッダーを付けられないコネクタ(claude.ai・ChatGPT)向けに、フロントの route handler が `/api/v1/mcp/<トークン>` も受け、トークンをヘッダーに載せ替えて `/api/v1/mcp` へ流す(API のログに URL のトークンを残さない)
  - REST の案内(`GET /api/v1/guide`、`rest.md`+`records.md`。ログイン不要。本番ではフロントの route handler を通すので、トークンかログインは要る)。MCP を使わない AI(Claude Code on the web など)向け。環境変数 `ARCHIEVES_API_URL=https://<サイト>/api/v1` と network secret(種類 Bearer、ホストはサイト、ヘッダー Authorization、値はトークン)を入れ、頼むときに案内を読ませる
  - 記録の読み方・AI コメントの書き方は `records.md` に一つだけ書き、MCP と REST の両方に入れる。エンドポイントや記録の形を変えたら、ここも直す
- 管理者は画面からは決めない。db の行を直に書き換える(`UPDATE users SET is_admin = true WHERE sub = '<Cognito の sub>';`)。`is_admin` は本人の行(`GET /users/me`・`/users/me/ensure` の `MeRead`)にだけ載せる
- テストの `client` は `current_user`(`TEST_CLAIMS` の `sub` の利用者)がいる状態。他人の行は `factories` で作る。利用者の行が無い状態は `unregistered_client`、ログインしていない人は `anonymous_client`、`current_user` が発行したトークンで来る Claude Code は `token_client`

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
- 本番へのマイグレーションは手で流す

## debug のスクリプト

- `debug/` の多く(`debug/api/run_debug_server.py`・`debug/db/randomize/random_all_data.py`・`debug/db/setup/setup_debug_user.py`)は、`.vscode/launch.json` の「Python Debugger: Current File」からだけ起こす。cwd と `PYTHONPATH` がプロジェクトのルートになるので、`app.*`・`mods.*` をそのまま import する。`sys.path.insert` の決まり文句を足さない
- `debug/test_env/run_test_api_server.py` はシェルから直に回すので、例外としてその決まり文句を持つ(消すと cwd 次第で import が落ちる)
- `tools/` は `source/back` を cwd にして `python -m tools.<名前>` で回すので、決まり文句は要らない

## デプロイ

- `.build/Dockerfile` が Lambda(Lambda Web Adapter)の image。`requirements.txt`(ハッシュ付き)を入れる。起動する ASGI アプリは CMD で決まり、マイグレーションの Lambda は同じ image で `app.migration_app:app` に差し替える
- 本番の Lambda は NAT のない VPC の中にあるので、Cognito の公開鍵を取りに行けない。`AUTH_MODE=proxy` で、フロントの route handler が確かめた利用者を `x-archieves-user-*` ヘッダーで受ける(`API_KEYS` が必須)。db へは `DB_IAM_AUTH=true` の IAM データベース認証で繋ぐ
- `infra/`(CDK)が ECR・Lambda・CI のロールを持ち、GitHub Actions(`.github/workflows/deploy-api.yml`)が image の差し替えとマイグレーションを行う

### 環境

本番(prod)と develop 環境(dev)を持つ。名前は `infra/lib/config.ts` の `stageConfig` が決める。

| | 本番 | develop 環境 |
| --- | --- | --- |
| デプロイのきっかけ | `main` への push | `develop` への push |
| CDK のスタック | `ArchievesApi` | `ArchievesApiDev` |
| Lambda | `archieves-api`・`archieves-migrate` | `archieves-api-dev`・`archieves-migrate-dev` |
| ECR の tag(関数が指す先) | `main` | `develop` |
| db(同じ RDS のインスタンス) | `archieves` | `archieves-dev` |
| db のロール | `archieves_app`・`archieves_migrator` | `archieves_dev_app`・`archieves_dev_migrator` |
| SSM | `/archieves/...` | `/archieves/dev/...` |
| GitHub Actions のロール・変数 | `github-archieves-deploy`、`LAMBDA_FUNCTION_NAME` など | `github-archieves-deploy-dev`、頭に `DEV_` を付けたもの |
| 画面(Amplify のブランチ) | `main` | `develop`(ブランチの環境変数で dev の API を向く。Cognito もブランチごとに別) |
| Amplify のコンピュートロール | アプリの単位に付けた `ArchievesApi` のロール | 同じロールを使う。dev の関数のリソースポリシーが、関数 URL 越しの呼び出しを許す |

- db のロールを環境ごとに分け、db の PUBLIC の CONNECT を外してあるので、ある環境の Lambda はほかの環境の db に入れない(`infra/sql/archieves_roles.sql`)
- ECR の image は二つの環境で一つのリポジトリを使う。ライフサイクルは `main`・`develop` の tag の image を先に拾い、ほかを新しい 30 個まで残す
- develop 環境を初めて建てる順: SSM に合言葉(`/archieves/dev/api-keys/web`、SecureString)を置く → 踏み台越しにマスターで `archieves_roles.sql` を dev の変数で流す → `cdk deploy ArchievesCi` → ECR に `develop` の tag の image を置く(`infra/lambda/push-image.sh develop`、または `main` の image に tag を足す)→ `cdk deploy ArchievesApiDev` → `archieves-migrate-dev` を呼ぶ → GitHub の `DEV_*` の変数・秘密を置く → Amplify に `develop` のブランチを足し、環境変数(`ARCHIEVES_API_URL`・`ARCHIEVES_API_KEY`)をブランチに付ける
- Amplify のブランチにはコンピュートロールを付けない。Amplify Gen 2 がブランチにバックエンドを結び付ける処理(BranchLinker)が、ブランチの単位のロールの `iam:PassRole` を持たずに落ちる(`infra/lib/config.ts` の `amplifyComputeRole`)
