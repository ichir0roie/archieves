# API基盤

archieves-api リポジトリに、以下の構成でAPIの雛形を実装した。

## 技術スタック

- Python / FastAPI / SQLAlchemy 2.0
- Alembic（マイグレーション）
- PostgreSQL（コスト優先期はパブリックサブネットEC2への自前構築、運用負荷が許容できなくなったらRDSへ移行。詳細は [データベース/postgresql_on_aws.md](../インフラ/データベース/postgresql_on_aws.md) を参照）
- フロントエンド: Next.js（Amplify Hosting でデプロイ）

## 実行環境

- コンテナイメージ化した FastAPI アプリを [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter)
  を使って AWS Lambda 上で動かす。
  - アプリ側は普通の ASGI アプリ（uvicorn）のままで、Lambda 専用のハンドラコード（Mangum等）が不要。
  - ローカル(`docker run` / `docker compose`)と Lambda 上で同一イメージがそのまま動く。
- API Gateway（HTTP API）経由でリクエストを受ける。
- フロントエンド(Next.js)はAmplify Hostingでビルド・配信し、ブラウザ/SSRからAPI GatewayのエンドポイントをfetchするクライアントAPI呼び出し構成とする(CORS設定が必要)。

### DB接続方式（EC2自前Postgresを使う場合の設計判断）

Lambdaはデフォルトでは VPC の外(AWS管理ネットワーク)で動作するため、EC2上のPostgresに繋ぐ方式は必ず以下のBを選ぶこと。

- ❌ **A. Lambda非VPC + EC2のパブリックIPへ接続**: Lambda(非VPC)の送信元IPは固定されずAWSの広いレンジを動的に使うため、セキュリティグループでの発信元IP絞り込みが実質機能しない。DBを事実上インターネットに公開することになり採用しない。
- ✅ **B. Lambdaを同一VPCにアタッチし、EC2のプライベートIPへ接続**: DBを外部に一切公開せず、VPC内部でのみ到達可能にする。EC2はパブリックサブネットに置いたままでよい(内部通信はローカルルートで完結し、パブリック/プライベートサブネットの区別は影響しない)。

Bを採用する場合の注意点:

- LambdaをVPCにアタッチした状態でSecrets Managerなど外部APIを呼ぶとNAT Gateway(または各種VPCインターフェースエンドポイント)が必要になり、[コスト最適化の検討](../インフラ/データベース/postgresql_on_aws.md)で問題視したNAT費用が再発する。**DB接続文字列はSecrets ManagerではなくLambdaの環境変数(暗号化済み)で持たせ、NATなしでVPC内完結させる。**
- VPCアタッチによるコールドスタート増加は、Hyperplane ENI採用以降は軽微(数百ms程度)なので許容範囲。
- **コネクションプール枯渇に注意**: RDSと違いRDS Proxyのようなマネージドプーリングが使えないため、Lambdaの同時実行数増加でPostgresの`max_connections`(t4g.microでは目安100前後)を使い切りやすい。アクセスが増えてきたらEC2上にPgBouncerを同居させてコネクションを集約する。
- 上記の運用負荷(単一AZ・自前パッチ・コネクションプール手当て)が見合わなくなったら、RDS(+RDS Proxy、Multi-AZ)への移行を検討する。移行トリガーの目安は[データベース/postgresql_on_aws.md](../インフラ/データベース/postgresql_on_aws.md)の「将来的な移行の目安」を参照。

## 雛形に含まれるもの

- `app/` ディレクトリ構成（core/db/models/schemas/crud/api）
- サンプルエンティティ: `User`, `Record`（スコア・的中位置を持つ記録）
- `alembic/` マイグレーション設定
- `Dockerfile`（Lambda Web Adapter 組み込み）
- `docker-compose.yml`（ローカル開発用: API + Postgres）
- `template.yaml`（AWS SAM: Lambda(イメージ) + API Gateway HTTP API の雛形。
  DB自体はこのテンプレートの範囲外。RDSを使う場合はSecrets Manager経由、EC2自前Postgresを使う場合は上記の通りLambda環境変数経由でDB接続文字列を渡す想定）
- pytest によるテスト一式

詳細は archieves-api リポジトリの README を参照。
