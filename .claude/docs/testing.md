# テスト

- 実装が一段落したら、変えた範囲のテストを足す・直す。正常系だけでなく、エラー(404・弾く入力・壊れた入力)と境界のケースも書く
- db は手元でも web のセッションでも、手元の PostgreSQL の `archieves_test` で始まる db だけを使う(`CLAUDE.md` の「デバッグ・テストの db」)。web のセッションでも PostgreSQL は手元に作れる。「本番の db に繋げない」はテストを省く理由にならない
- テストを消す・飛ばす(skip)ことで通さない

## 単体テストと網羅テスト

`CLAUDE.md` の「実装からプルリクまで」の順で回す。

- 単体テスト: 実装の途中、デバッグのために直している所だけを確かめる(`pytest tests/<file>::<test>`、関数を一つ呼ぶ、画面を一枚撮るなど)。いつ回してもよい
- 網羅テスト: ユーザが実装を認めてから、プルリクの前に一度回す。変えた所に関わるものを全部回し、全部通ってからプルリクを作る
  - バックエンドを変えたとき: `source/back` で `.venv/bin/python -m pytest -q -p no:warnings`、`.venv/bin/python -m ruff check .`、`npx pyright --pythonpath .venv/bin/python`。API の応答が変わると E2E が落ちるので、フロントの E2E も回す
  - フロントエンドを変えたとき: `source/front` で `npm run typecheck`、`npm run lint`、`npm run test:e2e`(下の「E2E」)
  - 落ちたら直して、網羅テストを回し直す。変えた所と関わりの無い所で落ちたら、ユーザに伝える

## pytest(`source/back/tests`)

- `tests/conftest.py` は、app を import する前に `tools.testing_db.pin("archieves_test")` で `DATABASE_URL` を固定し、`AUTH_MODE=cognito` にする(手元の `.env` に引きずられない)
- `archieves_test` は、マイグレーションのバージョンが head と違うとき(マイグレーションを足した・ブランチを替えた)と、db が無いときだけ消して作り直し、マイグレーション(`alembic upgrade head`)で表を作る。バージョンが同じなら作り直さずに使う(行は各テストが巻き戻す)。同じバージョンのままマイグレーションの中身を書き換えたときは `ARCHIEVES_TEST_DB_RESET=1` を付けて回す。終わったあとは消さないので、落ちたあとに `psql` で表を覗ける
- PostgreSQL が止まっていれば `infra_local/postgres.sh` が起こす(`tools/testing_db.py` が回す)。`ARCHIEVES_DEV_DATABASE_URL` を渡せば回さない
- `tests/test_migrations.py` が、モデルとマイグレーションの食い違いを落とす。モデルを変えたらマイグレーションを足す(`.claude/docs/backend.md` の「マイグレーション」)
- `tests/test_openapi.py` が、`source/back/openapi.json` が今の API と食い違うと落とす。API を変えたら書き出し直す(`.claude/docs/backend.md` の「OpenAPI」)
- 使い捨てのスクリプトで db を使うときも、`from tools import testing_db; testing_db.pin("archieves_test_<名前>")` を `app.*` より先に呼ぶ(先に `app.db.session` を読むと止まる)

### fixture

- `s` は、テストが終わると書いたものが巻き戻るセッション。外側のトランザクションに savepoint で入るので、テスト自身のコミットも、`client` 越しにエンドポイントがするコミットも、db には残らない
- `client` は `s` をすべての要求で使い回す(本番は要求ごとに開いて閉じる)。そのため、要求のトランザクションが捨てられることに頼る処理は、自分で `s.begin_nested()` などで巻き戻す
- `client` は、書いたのにコミットせずに応答した要求を落とす(使い回しのセッションでは、コミットし忘れても次の要求から見えてしまうため)
- `factories` は `mods.factory_db` のすべての factory を `s` に結んだもの。API を叩いて行を用意するより、こちらを使う:

```python
def test_something(client, factories):
    user = factories.UserFactory(name="Yumi")
    factories.GameFactory.create_batch(3, user=user)
```

- factory は自分の行に要る親も作る(`PointFactory()` は end・round・game・user も作る)。親を渡せばそこに付ける(`RoundFactory(game=game)`)。`user` は永続化した利用者一人、`current_user` は `client` がログインしている利用者。`tests/test_factories.py` がこの結び付きを確かめるので、factory を足したらそこでも動くようにする
- 主キーの連番は巻き戻らないので、id を決め打ちしない

### カバレッジ

`app/` は 1 か所を除いて全行を通す(`.venv/bin/python -m pytest --cov=app --cov-report=term-missing`)。その 1 か所は、テストから構造上届かないもの:

- `app/db/session.py` の `get_session` の中身: `conftest` が差し替えるので、pytest では本番のセッションを作らない

ほかが通っていなければテストが足りない。この一覧を広げずにテストを書く。

## E2E(`source/front/e2e`、Playwright)

- すべての spec が `ensureRegistered()` から始まり API を叩くので、API なしでは 1 本も通らない。先にテスト用の API サーバーを起こす(`run_in_background`):

```
cd source/back && .venv/bin/python debug/test_env/run_test_api_server.py
```

- `archieves_test_api` は pytest と同じく、マイグレーションのバージョンが変わったときだけ作り直す(`--reset` で必ず作り直す)。前の E2E の行は残るが、spec はそのテストが作ったもので確かめるので差し支えない。`AUTH_MODE=mock` で `:8080` を聞く(`--port` / `--db` で変えられる)
- それから `source/front` で `npm run test:e2e`(画面で見ながらなら `npm run test:e2e:ui`)。`playwright.config.ts` が `next dev` を `:13100`・ビルド先 `.next-test`・`NEXT_PUBLIC_AUTH_MODE=mock`・`ARCHIEVES_API_URL=http://127.0.0.1:8080` で起こす。ユーザの `next dev`(`:3100`・`.next`)とは別なので、使い回されない。API の向け先は `ARCHIEVES_API_URL`、画面のポートは `ARCHIEVES_E2E_WEB_PORT` で変えられる
- API の合言葉まで確かめるときは、API を `API_KEYS=web=<鍵>` で起こし、E2E に `ARCHIEVES_API_KEY=<鍵>` を渡す
- 前の E2E の `next dev`(:13100)が残っていると使い回される。API の向け先を変えたときは止めてから回す
- どの画面も `AuthGate` を通り、API に行の無い利用者を `/profile/settings` へ飛ばす。spec は `ensureRegistered(page)` から始める。利用者にデータが要る画面(スコアログ・統計・ランキング)は `e2e/recordGame.ts` で一試合を記録してから見る
- spec は一つの API の db に対して並べて走る。数・件数ではなく、そのテストが作ったもの(返った試合の id、一意の名前)で確かめる
- どの spec も同じモックの利用者(`local-dev-user`)で動く。プロフィールを保存するテストは、並べると互いの保存を上書きするので、`e2e/profile-settings.spec.ts` に集めて一つずつ(`mode: "serial"`)走らせる
- テストの時間切れは 120 秒、expect は 15 秒に上げてある。Turbopack は route を初めて開いたときにコンパイルするので、既定(30 秒 / 5 秒)では空の `.next-test` で何も壊れていなくても切れる
- 空の `.next-test` での最初の一回は、並べてコンパイルするので、いくつもの route を回す spec(`navigation.spec.ts`)が `読み込み中...` のまま切れることがある。不具合と決める前に、温まったキャッシュでもう一度回す。本当に壊れていればまた落ちる。このために時間切れをさらに上げない
- 役割や文字で指せない要素を spec から指すときは、コンポーネントに意味の分かる class(`.ScoreLogGame`・`.ScoreSheet`)を足してそれで選ぶ

## 画面を起こす

- テスト・動作確認で画面が要るときは、ランチャーで API と画面をまとめて起こす(`run_in_background`):

```
cd source/back && .venv/bin/python -m tools.dev --test --seed --api-port 18000 --web-port 13101 --dist-dir .next-test
```

- `--test` は `archieves_test_dev` に向け、API と画面をモックのログインにする。db はマイグレーションのバージョンが変わったとき(と `--reset`)だけ作り直し、それ以外は前の行を残して使う。`--seed` は、作り直したときだけ乱数の行(`debug/db/randomize`)と、モックの利用者・その 5 年分の試合(`random_user_history.py`)を足す。使い回すときは足さない。行を入れ直したいときは `--reset --seed`。`--test` を付けずに起こすと `source/back/.env` の db に向くので、確かめでは必ず付ける
- ポート・ビルド先はユーザのもの(:8000 / :3100 / `.next`)と分ける。同じだと `tools.dev` がユーザの起動を止める(指定のポートを使うプロセスを止めてから起こす)。E2E の `next dev` も `.next-test` を使うので、並べて起こすときは `--web-port` を E2E の 13100 と違えるか、片方を止める
- `source/front` の依存が無ければランチャーが `npm ci` する
- どちらかが落ちる・20 秒を越えて応答しないと、そちらだけを起こし直す

### 見る・撮る

- 画面は `http://localhost:<web-port>` で開く。`127.0.0.1` だと `next dev` が開発用の資源を別の origin として拒み、画面が組み上がらないことがある
- 撮るのは Playwright。`source/front/node_modules/playwright-core` を node のスクリプトで読み、`chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })` から開く。スクリプトはスクラッチパッドに置く
- スマホ向けの画面が多いので、`viewport: { width: 420, height: 860 }` くらいで撮る
- 撮った画像は `SendUserFile` に `display: "render"` を付けて送る

### 止める

- 使い終わったら `TaskStop` で止め、ポートが閉じたことを確かめる(`curl -s -o /dev/null -w '%{http_code}' <URL>` が `000`)
- 起こしたあとは `git status` を見て、`tsconfig.json`・`next-env.d.ts`・`package-lock.json` などが変わっていたら戻す
