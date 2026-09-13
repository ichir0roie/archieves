# archieves

## リポジトリ構成

<https://github.com/ichir0roie/archieves.git>

モノレポ。フロントエンドとバックエンドを含む。

- `source/front`: フロントエンド (Next.js)
- `source/back`: バックエンド

各アプリ固有の規約・コマンドはそれぞれの `CLAUDE.md` を参照:

- [`source/front/CLAUDE.md`](source/front/CLAUDE.md)
- [`source/back/CLAUDE.md`](source/back/CLAUDE.md)

## ブランチ運用

developブランチをベースのブランチとして、作業用のブランチを作成して作業すること。
作業後のマージブランチもdevelop。

ローカル環境で作業する場合は、現在のブランチで作業する。

## テスト運用

実装が一段落したら、毎回以下を完了させてからタスクを終えること。ユーザーに確認を取る必要はない。

1. 変更した範囲に対応するテストを追加・更新する（正常系だけでなく、エラー・境界ケースも書く）
2. テストを実行する
3. 失敗したテストを修正する（テストを削除・スキップして通すのは不可。プロダクトコード側の不具合ならそちらを直す）

実行コマンドは各アプリの `CLAUDE.md` を参照:

- バックエンド (`source/back`): `python -m pytest` と `python -m ruff check .`。
  テスト用DBはsqlite（インメモリ）で、DBサーバもコンテナも不要。
  ただしPython 3.14で実行する必要がある（`.venv/bin/python -m pytest`）
- フロントエンド (`source/front`): `npm run test:e2e`（Playwright）、`npx tsc --noEmit`、`npm run lint`

バックエンドのPythonは3.14に統一している。古いインタプリタ向けの互換コードは書かない。

バックエンドを触った場合はフロントエンドのE2Eも通るか確認する。APIの応答が変わるとE2Eが落ちるため。

### Claude Code on the web での実行

環境構築は `.claude/scripts/setup-dev-env.sh` が行う。バックエンドの
Python 3.14 venv (`source/back/.venv`) とフロントエンドの npm パッケージを
入れ、venv を PATH の先頭に置く。postgresもdockerも使わない。

`.claude/hooks/session-start.sh` がこれを**非同期で**呼ぶため、セッションは
待たされずに始まる。代わりに、セッション開始直後は環境がまだ整っていない
可能性がある。**テストを実行する前に一度呼ぶこと。**

```
./.claude/scripts/setup-dev-env.sh      # 準備済みなら0.1秒未満で終わる
cd source/back && pytest && ruff check .
```

何度呼んでも安全で、依存ファイル（`requirements*.txt` /
`package-lock.json`）が変わっていなければ何もしない。非同期のフックと
同時に走っても壊れないようロックを取る。`backend` / `frontend` を引数に
渡せば片方だけ実行できる。

## PR・マージ運用

作業用ブランチでの変更をPR化することは、毎回ユーザーに確認せず実施してよい（webアプリ側の運用に任せる）。

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
