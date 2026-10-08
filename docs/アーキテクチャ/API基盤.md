# API基盤

archieves-api リポジトリに、以下の構成でAPIの雛形を実装した。

## 技術スタック

- Python / FastAPI / SQLAlchemy 2.0
- Alembic（マイグレーション）
- PostgreSQL（RDS for PostgreSQL, `db.t4g.micro`, Single-AZ, 3年RI・前払いなしを採用。詳細は [データベース/postgresql_on_aws.md](../インフラ/データベース/postgresql_on_aws.md) を参照）
- フロントエンド: Next.js（Amplify Hosting でデプロイ）

## 実行環境

- コンテナイメージ化した FastAPI アプリを [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter)
  を使って AWS Lambda 上で動かす。
  - アプリ側は普通の ASGI アプリ（uvicorn）のままで、Lambda 専用のハンドラコード（Mangum等）が不要。
  - ローカル(`docker run` / `docker compose`)と Lambda 上で同一イメージがそのまま動く。
- API Gateway（HTTP API）経由でリクエストを受ける。
- フロントエンド(Next.js)はAmplify Hostingでビルド・配信する。ブラウザはAPI Gatewayを直に叩かず、Next.jsのroute handler(`source/front/src/app/api/v1/[...path]/route.ts`)が同じoriginの`/api/v1/*`を受けてAPIへ流す(ai-novel-coreと同じ形)。
  - route handlerが合言葉`x-archieves-api-key`(`ARCHIEVES_API_KEY`)と、クッキーのCognitoのセッションから引いたIDトークンを付ける。APIは`API_KEYS`にある鍵の無い要求を断り、IDトークンで利用者を確かめる。
  - ブラウザとAPIが同じoriginになるので、CORSの設定は要らない。

### DB接続方式（RDSへの接続設計）

Lambdaはデフォルトでは VPC の外(AWS管理ネットワーク)で動作するため、`publicly accessible`を無効にしたRDSに繋ぐには、Lambdaを同一VPCにアタッチしプライベートエンドポイント経由で接続する方式を採る。RDSを公開設定にしてLambda非VPCから繋ぐ方式は、Lambda(非VPC)の送信元IPが固定されずセキュリティグループでの絞り込みが実質機能しないため採用しない。

VPCアタッチを採用する場合の注意点:

- LambdaをVPCにアタッチした状態でSecrets Managerなど外部APIを呼ぶとNAT Gateway(または各種VPCインターフェースエンドポイント)が必要になり、[コスト最適化の検討](../インフラ/データベース/postgresql_on_aws.md)で問題視したNAT費用が再発する。**DB接続文字列はSecrets ManagerではなくLambdaの環境変数(暗号化済み)で持たせ、NATなしでVPC内完結させる。**
- VPCアタッチによるコールドスタート増加は、Hyperplane ENI採用以降は軽微(数百ms程度)なので許容範囲。
- **コネクションプールに注意**: Lambdaの同時実行数増加でPostgresの`max_connections`(`db.t4g.micro`では目安100前後)を使い切る可能性がある。同時アクセスが増えてきたらRDS Proxyの追加を検討する(追加コストあり)。
- 単一障害点対策(AZ障害への耐性)が必要になったら、Single-AZからMulti-AZへの変更を検討する。詳細は[データベース/postgresql_on_aws.md](../インフラ/データベース/postgresql_on_aws.md)の「将来的な移行の目安」を参照。

## 雛形に含まれるもの

- `app/` ディレクトリ構成（core/db/models/schemas/crud/api）
- サンプルエンティティ: `User`, `Record`（スコア・的中位置を持つ記録）
- `alembic/` マイグレーション設定
- `Dockerfile`（Lambda Web Adapter 組み込み）
- `docker-compose.yml`（ローカル開発用: API + Postgres）
- `infra/`（CDK: ECR・Lambda(イメージ)・マイグレーション用 Lambda・CI のロール。手順は [デプロイ](../インフラ/デプロイ.md)）
- pytest によるテスト一式

詳細は archieves-api リポジトリの README を参照。
