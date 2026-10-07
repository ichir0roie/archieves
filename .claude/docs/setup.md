# 環境とコマンド

## 用意

- `.claude/scripts/setup-dev-env.sh` が、API の venv(`source/back/.venv`、Python 3.14)とフロントの `node_modules` を入れる。`backend` / `frontend` を引数に渡せば片方だけ。依存のファイル(`requirements*.txt`・`package-lock.json`)が変わっていなければ 1 秒かからずに何もせず終わる。同時に走っても壊れないようロックを取る
- web のセッションでは SessionStart フックがこれと `infra_local/postgres.sh` を裏で回す(ログは `.cache/session-setup.log`、進み具合の印は `.cache/session-setup/`)。python・npm などを使うコマンドは、PreToolUse フック(`.claude/hooks/wait-setup.sh`)が用意の済むまで待たせる
- 手元ではフックは何もしない。初めてのときと依存が変わったときに `./.claude/scripts/setup-dev-env.sh` を回す
- web のセッションで後から足したリポジトリ・戻ったコンテナでは印が無いので待たされない。`.venv` が無いと言われたら `./.claude/scripts/setup-dev-env.sh` を回す

## python

- python・pytest・ruff・alembic は `source/back` を cwd にし、`.venv/bin/python -m <道具>` で呼ぶ。web のセッションでは venv が PATH の先頭に入るので素の `pytest` / `ruff` でもよい
- Python は 3.14 だけ。デプロイの image(`source/back/.build/Dockerfile`)も ruff の `target-version` も 3.14。古いインタプリタ向けの互換コードは書かない。PEP 695 の型引数(`def get_or_404[T](...)`)・`Generator[T]` を使う
- コンテナの `python3`(3.11)は `app/` の構文で import もできない。`.venv` を使う
- venv は uvx で新しめの uv を使って作る。素の `uv`(`/root/.local/bin/uv` など)は古く、"3.14" を rc のバージョンに解いて pydantic が落ちる:

```
uvx --from 'uv>=0.9' uv venv --python 3.14 source/back/.venv
uvx --from 'uv>=0.9' uv pip install --python source/back/.venv/bin/python -r source/back/requirements-dev.txt
```

- `.venv` に pip は入らない
- `requirements.txt`(本番の依存)と `requirements-dev.txt`(テスト・lint を足したもの)は、依存の依存までバージョンとハッシュを固定したもの。手では書かない。直接使うパッケージは `requirements.in` / `requirements-dev.in` に書き、そこから作る。パッケージを足す・バージョンを上げるときは `source/back` で:

```
uvx --from 'uv>=0.9' uv pip compile requirements.in --universal --python-version 3.14 --generate-hashes -o requirements.txt
uvx --from 'uv>=0.9' uv pip compile requirements-dev.in --universal --python-version 3.14 --generate-hashes -o requirements-dev.txt
uvx --from 'uv>=0.9' uv pip install --python .venv/bin/python -r requirements-dev.txt
```

- 固定したバージョンの中で上げるだけなら、`--upgrade-package <名前>`(全部なら `--upgrade`)を足す
- `_cffi_backend` の import のエラーは、venv でなくシステムの python で動かしている印。何も入れずに `.venv/bin/python` で動かし直す

## npm

- `source/front` で動かす。依存は `npm ci` で入れる。`npm ci` が落ちても `npm install` で代えない(`package-lock.json` が書き換わる)。パッケージを足すときだけ `npm install <名前>` を使い、`package-lock.json` の差分をコミットする(npm は `yarn.lock` も合わせて書き換える。そのままコミットする)
- `@playwright/test` は `1.56.0` に固定している(`^` にしない)。web のセッションには `/opt/pw-browsers` に Chromium 1194 が入っていて、それと合うのがこのバージョンの Chromium だけだから。上げるときは `playwright-core` の `browsers.json` で合うかを確かめる。手元では `npm ci` のあとに一度 `npx playwright install chromium` を回す

## 環境変数

| 環境変数 | 中身 | 渡す所 |
| --- | --- | --- |
| `DATABASE_URL` | API が読み書きする db。無ければ `DB_*` から組む | `source/back/.env`(`.env.example` から作る) |
| `AUTH_MODE` | `cognito`(既定。Cognito の ID トークンを確かめる)か `mock`(`MOCK_USER_*` の利用者として通す) | 同上 |
| `ARCHIEVES_DEV_DATABASE_URL` | 手元の PostgreSQL の開発用の db(`archieves_dev`)。テスト用の db は同じサーバーに作る | 渡さなければ `tools/testing_db.py` が `infra_local/postgres.sh` を回して引く |
| `API_KEYS` | API の合言葉(`x-archieves-api-key`)。`名前=鍵` をカンマで区切る。空なら確かめない | 本番は SAM の `ApiKeys`。手元・テストでは渡さない |
| `ARCHIEVES_API_URL` | フロントの route handler(`src/app/api/v1`)が流す先の API(既定 `http://127.0.0.1:8000`)。サーバーだけが読む | `source/front/.env.local` か、起こすときの環境変数。本番は Amplify Hosting の環境変数 |
| `ARCHIEVES_API_KEY` | route handler が付ける合言葉。API の `API_KEYS` のうちの一つの鍵 | 同上 |
| `NEXT_PUBLIC_AUTH_MODE` | `mock` なら Amplify を通さず `NEXT_PUBLIC_MOCK_USER_*` の利用者としてログインした扱い。API の `AUTH_MODE` と揃える | 同上 |
| `ARCHIEVES_WEB_DIST_DIR` | `next dev` のビルド先(既定 `.next`)。二つ目の `next dev` を起こすときに `.next-test` などにする | 起こすときの環境変数 |
| `PYTHONUTF8` | `1`(Windows の文字化け除け) | web のセッションはフックが渡す |

- 本番の RDS へは `scripts/rds-tunnel.sh`(`.example` から作る)の転送で繋ぐ。テスト・デバッグでは使わない(`CLAUDE.md` の「デバッグ・テストの db」)

## 文字コード

- リポジトリのテキストはすべて UTF-8(BOM 無し)。python でファイルを開くときは `encoding="utf-8"` を付ける
- db も UTF-8 で作る(`infra_local/postgres.sh`・`tools/testing_db.py` の `CREATE DATABASE ... ENCODING 'UTF8'`)

## フック

- フック(`.claude/hooks/`)と `.claude/settings.json` は、書き換える前に何を変えるかをユーザに示して承認を取る
- 書き換えたフックは、作業ツリーを(`node_modules`・`.venv`・`.cache` を除いて)スクラッチパッドに写し、`CLAUDE_CODE_REMOTE=true CLAUDE_ENV_FILE=<写しの中のファイル>` を付けて動かして確かめてから登録する。確かめずに登録すると、このセッションのツールの呼び出しを待たせ続けることがある

## コマンドのエラー

エラーは握りつぶさず、原因を特定して対策してから作業に戻る。原因がコードならコードを、呼び出し方(引数・環境変数・手順)なら指示書(`CLAUDE.md`・`.claude/docs/`)を直す。

- exit 144 でシェルごと止まった: `pkill -f` / `pgrep -f` のパターンが自分のシェルにも当たった。一字を `[]` で囲む(`'[n]ext dev'`)
- 裏で回しているコマンドを止める: `pkill` ではなく、そのタスクの id で `TaskStop` する
- 使い捨てのスクリプトで import が落ちた: スクラッチパッドのファイル名が標準ライブラリを隠した(`inspect.py` など)。`check_<対象>.py` のように名付ける
- 一括置換が当たらないまま進んだ: python の `str.replace` は当たらなくても黙る。`assert t.count(old) == 1` を付ける
- heredoc の中身が途中で切れた: 中身に同じ区切り `EOF` があった。区切りは `PYEOF` のように中身に無い語にする
- 裏のコマンドの出力を `until grep …; do sleep …; done` で待ったら終わらなかった: 待つ文字列が出力に出ないことがある。裏で回したものは終わりの知らせを待つか、`Monitor` で待つ。ループで待つなら上限の時間を付ける
- `ss` が無い: web のセッションのコンテナには入っていない。ポートの持ち主は `lsof -iTCP:<port> -sTCP:LISTEN` で見る
- `npm ci`・`uvx`・`curl` がプロキシで落ちた(`proxy`・`403`・TLS): `/root/.ccr/README.md` と `curl -sS "$HTTPS_PROXY/__agentproxy/status"` を見て、道具ごとの直し方でやり直す。通らなければユーザに伝えて止まる。落ちたチェック(typecheck・lint など)を飛ばして先へ進まない

## VS Code(手元)

- `.vscode/tasks.json` には、デバッグで起こすもの(PostgreSQL `postgres: start`・API `api: start`・画面 `front: start`・両方 `dev: API + web …`)だけがある。裏で動き続けるタスクは `isBackground` で、`problemMatcher` の `endsPattern` が出たら「起きた」とみなす(起動のログの文言を変えたら合わせる)
- F5 の既定(`.vscode/launch.json` の一番上)は、`tools.dev --test --seed` でテスト用の db(`archieves_test_dev`)とモックのログインの API(:8000)・画面(:3000)を起こし、Chrome で開く。Chrome のプロファイルは `.vscode/chrome-user-data/`(gitignore 済み)
- `.env` の db と Cognito で見るときは「Chrome: web (.env db, Cognito)」。先に `source/front` で `npx ampx sandbox --once` を回して `amplify_outputs.json` を作り、`source/back/.env` の `USERPOOL_ID`・`APP_CLIENT_ID` を合わせる(`docs/インフラ/認証/Amplifyサンドボックス.md`)
- API にブレークポイントを置くときは「Python: API (debugpy, :8000)」か、compound の「API (debugpy) + Chrome」
