# テスト・デバッグの db(手元の PostgreSQL)

## 背景

フロントの実装が API と正しく繋がって動くか、また API が本番と同じ PostgreSQL で
正しく動くかを、Claude Code のクラウドセッションでも手元でも確かめたい。

以前は、クラウドセッションに docker のデーモンが無いため、テストとテスト用の API サーバーを
sqlite で動かしていた。しかし sqlite では PostgreSQL に固有の問題を拾えず、
sqlite のための回避(savepoint の細工、BIGINT の sqlite 用の型)もコードに残っていた。

## 決定

ai-novel-core に倣い、テスト・デバッグの db を手元の PostgreSQL に置く。

- `infra_local/postgres.sh` が用意する。クラウドセッションでは apt の PostgreSQL のクラスタ
  (:5432)、手元では Docker のコンテナ(:55434)。docker のデーモンは要らない
- 開発用の db は `archieves_dev`。テスト・デバッグの db は同じサーバーの `archieves_test` で始まる db
  (pytest は `archieves_test`、テスト用の API サーバーは `archieves_test_api`、
  `tools.dev --test` は `archieves_test_dev`)
- どれも起こすたびに作り直し、マイグレーション(`alembic upgrade head`)で表を作る。
  本番と同じ表を使い、モデルとマイグレーションの食い違いはテストで落とす
- 向け先は `tools/testing_db.py` が手元のサーバーの決まった名前の db だけに限る。本番の RDS には向けない

## 関連

- [`.claude/docs/testing.md`](../../../.claude/docs/testing.md)
- [`.claude/docs/backend.md`](../../../.claude/docs/backend.md) の「モデルとマイグレーション」
