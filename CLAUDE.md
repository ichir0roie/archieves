# archieves

## リポジトリ構成

<https://github.com/ichir0roie/archieves.git>

モノレポ。フロントエンドとバックエンドを含む。別リポジトリではない。

- `source/front`: フロントエンド (Next.js)
- `source/back`: バックエンド (FastAPI)

各アプリ固有の規約・コマンドはそれぞれの `CLAUDE.md` を参照:

- [`source/front/CLAUDE.md`](source/front/CLAUDE.md)
- [`source/back/CLAUDE.md`](source/back/CLAUDE.md)

## 共通の規約

フロント・バックの両方に適用する。

- コードを読めば分かることをコメントに書かない。逆に、なぜそうしたかが
  コードから読み取れない箇所（回避策、意図的な例外、前提条件、ハマりどころ）
  にはコメントを残す。`source/back/app` と `source/front/src` の既存コメントが
  この方針の見本。
- 要素は1行ずつ並べる（JSXのprop、配列・dictの要素、関数の引数など）。
- チャット応答の末尾に作業内容のまとめを書かない。

## ブランチ運用

ベースブランチは develop。PRのマージ先も develop。

- Claude Code on the web のセッション: セッション開始時に指示されたブランチで
  作業する。
- ローカル環境: 現在のブランチで作業する。ただし develop 上にいる場合は
  作業用ブランチを切ってから変更する。

## テスト運用

実装が一段落したら、毎回以下を完了させてからタスクを終えること。ユーザーに確認を取る必要はない。

1. 変更した範囲に対応するテストを追加・更新する（正常系だけでなく、エラー・境界ケースも書く）
2. テストを実行する
3. 失敗したテストを修正する（テストを削除・スキップして通すのは不可。プロダクトコード側の不具合ならそちらを直す）

バックエンドのPythonは3.14に統一している。古いインタプリタ向けの互換コードは書かない。

バックエンドを触った場合はフロントエンドのE2Eも通るか確認する。APIの応答が変わるとE2Eが落ちるため。

### 実行手順

まず環境構築スクリプトを一度呼ぶ。これで `source/back/.venv` が PATH の先頭に
入り、`python` / `pytest` / `ruff` が3.14のものになる。

```
./.claude/scripts/setup-dev-env.sh
```

バックエンド (`source/back`): テスト用DBはsqlite（インメモリ）で、DBサーバも
コンテナも不要。

```
cd source/back
pytest
ruff check .
```

PATHが通っていない環境（スクリプト未実行、ローカルの素のシェル）では
`.venv/bin/python -m pytest` / `.venv/bin/python -m ruff check .` と明示する。

フロントエンド (`source/front`): 型チェックとlintはAPI不要。

```
cd source/front
npx tsc --noEmit
npm run lint
```

E2E（Playwright）は起動中のAPIサーバーが必要。全specが `ensureRegistered()`
経由で archieves-api を叩くため、APIなしでは1本も通らない。
`NEXT_PUBLIC_API_BASE_URL` の既定値は `:8000` なので、テスト用APIサーバーの
`:8080` を明示して渡す。

```
# シェル1: テスト用APIサーバー（sqlite、dockerなし）
cd source/back && .venv/bin/python debug/test_env/run_test_api_server.py

# シェル2: E2E
cd source/front && NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1 npm run test:e2e
```

既に `npm run dev` が起動している場合、Playwrightはそれを再利用する
（`playwright.config.ts` の `reuseExistingServer`）ため、後から渡した
`NEXT_PUBLIC_API_BASE_URL` が反映されない。APIの向き先を変えたときは dev
サーバーを止めてから実行する。

詳細は [`source/front/CLAUDE.md`](source/front/CLAUDE.md) の「E2E tests」節と
[`source/back/CLAUDE.md`](source/back/CLAUDE.md) の「Test API server (sqlite)」節。

### Claude Code on the web での実行

環境構築は `.claude/scripts/setup-dev-env.sh` が行う。バックエンドの
Python 3.14 venv (`source/back/.venv`) とフロントエンドの npm パッケージを
入れ、venv を PATH の先頭に置く。postgresもdockerも使わない。

`.claude/hooks/session-start.sh` がこれを**非同期で**呼ぶため、セッションは
待たされずに始まる。代わりに、セッション開始直後は環境がまだ整っていない
可能性がある。**テストを実行する前に一度呼ぶこと。** 何度呼んでも安全で、
依存ファイル（`requirements*.txt` / `package-lock.json`）が変わっていなければ
0.1秒未満で何もせず終わる。非同期のフックと同時に走っても壊れないようロックを
取る。`backend` / `frontend` を引数に渡せば片方だけ実行できる。

venv構築の詳細（コンテナ同梱の `uv` が古く、`python3 -m uv` で呼ぶ必要がある
理由など）は [`source/back/CLAUDE.md`](source/back/CLAUDE.md) の
「Python version」節とスクリプト冒頭のコメントを参照。ここでは繰り返さない。

## PR・マージ運用

作業用ブランチにコミット・プッシュしたら、develop 向けのPRを作成する。これは
毎回ユーザーに確認せず実施してよい（webアプリ側の運用に任せる）。

PR化した後、ユーザーがチャット上で承認の意思を示したら（例:「OK」「LGTM」「マージして」「承認」など）、以下を確認なしで自動的に実行してよい。

- 対象PRのマージ（コンフリクト・CI失敗がない状態に限る）
- マージ後の作業用ブランチの削除（リモート・ローカルとも）

ただし以下の場合は自動マージせず、状況をチャットで報告してユーザーの判断を仰ぐこと。

- CIが red、または未実行
- マージコンフリクトがある
- レビューコメント・変更依頼が未解決
- ユーザーの承認メッセージが曖昧で、承認かどうか判断できない場合

## claude ドキュメント関連

要件、設計に関する情報は [docs](docs) に記載して、適宜読み取る。カテゴリ別の一覧は [docs/README.md](docs/README.md) を参照。
