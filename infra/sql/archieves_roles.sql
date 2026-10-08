-- archieves の db と、それを使う db のロール二つを作る。何度流しても同じ結果になる。
-- どちらもパスワードを持たせず、IAM データベース認証(rds_iam)で繋ぐ。
--   archieves_migrator: 表の持ち主。マイグレーションの Lambda(archieves-migrate)が alembic upgrade head を流す
--   archieves_app: 行の読み書きだけ。API の Lambda(archieves-api)が使う
-- マスターで、db は postgres に繋ぎ、リポジトリのルートから(CREATE DATABASE はトランザクションの中で流せないので -1 は付けない):
--   psql -v ON_ERROR_STOP=1 -f infra/sql/archieves_roles.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'archieves_migrator') THEN
    CREATE ROLE archieves_migrator LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'archieves_app') THEN
    CREATE ROLE archieves_app LOGIN;
  END IF;
END
$$;
ALTER ROLE archieves_migrator LOGIN NOCREATEDB NOCREATEROLE PASSWORD NULL;
ALTER ROLE archieves_app LOGIN NOCREATEDB NOCREATEROLE PASSWORD NULL;
GRANT rds_iam TO archieves_migrator;
GRANT rds_iam TO archieves_app;

-- 持ち主を archieves_migrator にして db を作るには、マスターが一員でなければならない。
-- 一員のまま残すと、マスターも rds_iam を持つ側に数えられ(継承を外しても)、パスワードで入れなくなる。
-- そこで db を作る間だけ一員にし、終わりに外す
GRANT archieves_migrator TO :"USER" WITH INHERIT TRUE, SET TRUE;
SELECT 'CREATE DATABASE archieves OWNER archieves_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'archieves') \gexec
REVOKE archieves_migrator FROM :"USER";

\connect archieves
GRANT CONNECT ON DATABASE archieves TO archieves_app;
GRANT USAGE ON SCHEMA public TO archieves_app;
-- これからマイグレーションで増える表・連番にも、archieves_app の行の読み書きの権限が付くようにする
ALTER DEFAULT PRIVILEGES FOR ROLE archieves_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO archieves_app;
ALTER DEFAULT PRIVILEGES FOR ROLE archieves_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO archieves_app;
