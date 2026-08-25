# API基盤

archieves-api リポジトリに、以下の構成でAPIの雛形を実装した。

## 技術スタック

- Python / FastAPI / SQLAlchemy 2.0
- Alembic（マイグレーション）
- PostgreSQL（本番は RDS を想定）

## 実行環境

- コンテナイメージ化した FastAPI アプリを [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter)
  を使って AWS Lambda 上で動かす。
  - アプリ側は普通の ASGI アプリ（uvicorn）のままで、Lambda 専用のハンドラコード（Mangum等）が不要。
  - ローカル(`docker run` / `docker compose`)と Lambda 上で同一イメージがそのまま動く。
- API Gateway（HTTP API）経由でリクエストを受ける。
- DB は Lambda から VPC 経由で PostgreSQL(RDS) に接続する想定。

## 雛形に含まれるもの

- `app/` ディレクトリ構成（core/db/models/schemas/crud/api）
- サンプルエンティティ: `User`, `Record`（スコア・的中位置を持つ記録）
- `alembic/` マイグレーション設定
- `Dockerfile`（Lambda Web Adapter 組み込み）
- `docker-compose.yml`（ローカル開発用: API + Postgres）
- `template.yaml`（AWS SAM: Lambda(イメージ) + API Gateway HTTP API の雛形。
  RDS自体はこのテンプレートの範囲外で、別途構築したDB接続文字列をSecrets Managerから渡す想定）
- pytest によるテスト一式

詳細は archieves-api リポジトリの README を参照。
