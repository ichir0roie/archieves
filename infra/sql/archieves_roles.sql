-- archieves の db と、それを使う db のロール二つを作る。何度流しても同じ結果になる。
-- どちらもパスワードを持たせず、IAM データベース認証(rds_iam)で繋ぐ。
--   migrator: 表の持ち主。マイグレーションの Lambda が alembic upgrade head を流す
--   app: 行の読み書きだけ。API の Lambda が使う
-- 名前は環境ごとに infra/lib/config.ts の stageConfig と揃えて、psql の変数で渡す。
-- マスターで、db は postgres に繋ぎ、リポジトリのルートから(CREATE DATABASE はトランザクションの中で流せないので -1 は付けない):
--   本番:        psql -v ON_ERROR_STOP=1 -v db=archieves -v migrator=archieves_migrator -v app=archieves_app -f infra/sql/archieves_roles.sql
--   develop 環境: psql -v ON_ERROR_STOP=1 -v db=archieves-dev -v migrator=archieves_dev_migrator -v app=archieves_dev_app -f infra/sql/archieves_roles.sql
-- 環境ごとにロールを分けるので、ある環境のロールは、ほかの環境の db に CONNECT できない(PUBLIC の CONNECT も外す)

-- psql の変数は $$ の中に展開されないので、DO ではなく \gexec で組み立てる
SELECT format('CREATE ROLE %I LOGIN', :'migrator')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'migrator') \gexec
SELECT format('CREATE ROLE %I LOGIN', :'app')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app') \gexec
ALTER ROLE :"migrator" LOGIN NOCREATEDB NOCREATEROLE PASSWORD NULL;
ALTER ROLE :"app" LOGIN NOCREATEDB NOCREATEROLE PASSWORD NULL;
GRANT rds_iam TO :"migrator";
GRANT rds_iam TO :"app";

-- 持ち主を migrator にして db を作り、db の権限を付け外しするには、マスターが一員でなければならない。
-- 一員のまま新しく繋ぐと、マスターも rds_iam を持つ側に数えられ(継承を外しても)、パスワードで入れなくなる。
-- そこで db を作る間だけ一員にし、\connect の前に外す
GRANT :"migrator" TO :"USER" WITH INHERIT TRUE, SET TRUE;
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'migrator')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
-- 既定では PUBLIC がどの db にも CONNECT できる。ほかの環境のロールに入らせない。
-- RDS のマスターは本当のスーパーユーザーではないので、マスター(この下の \connect と、あとの保守)にも付ける
REVOKE CONNECT ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO :"USER";
GRANT CONNECT ON DATABASE :"db" TO :"app";
REVOKE :"migrator" FROM :"USER";

\connect :"db"
-- スキーマの権限・これからマイグレーションで増える表と連番の既定の権限を変えるにも一員である要があるので、
-- 繋いだあと(この接続の中だけ)もう一度一員にして、最後に外す
GRANT :"migrator" TO :"USER" WITH INHERIT TRUE, SET TRUE;
GRANT USAGE ON SCHEMA public TO :"app";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app";

REVOKE :"migrator" FROM :"USER";
