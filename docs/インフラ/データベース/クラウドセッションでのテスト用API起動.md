# クラウドセッションでのテスト用API起動(sqlite)

## 背景

フロントの実装がAPIと正しく繋がって動くかを確認するには、実際にarchieves-apiを
起動してフロントから叩く必要がある。既存の手順は `.build/docker-compose.yml`
でpostgresコンテナ+APIコンテナを立てる方式だが、Claude Codeのクラウド
セッションには`docker`コマンド自体はあってもdockerデーモンが動いておらず、
この手順が使えない。

## 決定

クラウドセッションなどdockerが使えない環境では、postgresの代わりにsqliteの
ファイルDBに対してAPIサーバー(uvicorn)を直接起動する。

- スクリプト: `source/back/debug/test_env/run_test_api_server.py`
- 毎回、空のsqliteファイルを作り直してから起動する(前回のテストデータを
  引きずらない)
- スキーマ構築は既存の `debug/db/create_db.py`
  (`Base.metadata.create_all`)を流用する。単体テスト
  (`tests/conftest.py`)が既に`sqlite:///:memory:`で全体を動かしている
  実績があり、SQLAlchemyモデル層にpostgres固有の型・機能への依存がない
  ことは検証済み
- 認証は既存の`AUTH_MODE=mock`(Cognito検証をスキップする既存の仕組み)
  をそのまま使う。sqlite化とは独立した話で、これだけでは実APIは動かない
  (DBがないと結局動作しない)点に注意

## 守ること

- テスト用のsqlite起動処理は`app/`・`alembic/`本体とは分離し、
  `debug/test_env/`以下にのみ置く
- モデル・マイグレーション定義は引き続きpostgresqlを前提としたまま変更
  しない(sqlite対応のための型変更・分岐は入れない)。postgres/sqlite
  両対応は「どちらでも動く汎用的な書き方をする」ことで担保し、
  sqlite専用コードを本体に混ぜない
- dockerが使える環境(ローカル開発など)では、引き続き
  `.build/docker-compose.yml`によるpostgres起動を使ってよい。本ドキュメントの
  sqlite方式はdockerが使えない場合の代替手段

## 関連

- [`source/back/CLAUDE.md`](../../../source/back/CLAUDE.md)の
  「Test API server (sqlite)」節
- [`source/front/CLAUDE.md`](../../../source/front/CLAUDE.md)の
  「E2E tests」節
