#!/bin/bash
# 開発・テスト用の PostgreSQL を用意し、開発用の db(archieves_dev)の SQLAlchemy の URL を標準出力に出す。
# 何度走らせてもよい。サーバーが止まっていれば起こし、archieves_dev が無ければ作ってマイグレーションを流す。
# テスト用の db(archieves_test など)は、同じサーバーに tests/conftest.py・debug/test_env が作る。
# クラウド(Claude Code on the web)では apt の既定のクラスタ、それ以外では Docker のコンテナで動かす。
# 引数に python(source/back/.venv の 3.14)を渡せる。省くとリポジトリの venv を使う。
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

py=${1:-source/back/.venv/bin/python}
# 下で cwd を変えて呼ぶので絶対パスにする(シンボリックリンクは辿らない。辿ると venv の外の python になる)
[[ "$py" = /* ]] || py="$PWD/$py"
db=archieves_dev
user=archieves
password=archieves

if [ "${CLAUDE_CODE_REMOTE:-}" = true ]; then
  port=5432
  if ! command -v pg_ctlcluster >/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq >&2
    apt-get install -y -qq postgresql >&2
  fi
  service postgresql start >&2
  psql_on() { runuser -u postgres -- psql -d "$1" -v ON_ERROR_STOP=1 -qtAc "$2"; }
  is_ready() { pg_isready -q -h 127.0.0.1 -p "$port"; }
else
  port=55432
  container=archieves-postgres
  if ! docker container inspect "$container" >/dev/null 2>&1; then
    docker run -d --name "$container" --restart unless-stopped \
      -e POSTGRES_USER="$user" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=postgres \
      -p "127.0.0.1:$port:5432" -v archieves-postgres-data:/var/lib/postgresql/data \
      postgres:16 >&2
  elif [ "$(docker container inspect -f '{{.State.Running}}' "$container")" != true ]; then
    docker start "$container" >&2
  fi
  psql_on() { docker exec "$container" psql -U "$user" -d "$1" -v ON_ERROR_STOP=1 -qtAc "$2"; }
  # 初回の初期化中は、ソケットだけで聞く仮のサーバーが立つ。TCP で聞くまで待てば、その後の本番のサーバーに当たる
  is_ready() { docker exec "$container" pg_isready -q -h 127.0.0.1 -U "$user"; }
fi

for _ in $(seq 60); do
  is_ready && break
  sleep 1
done
is_ready || { echo "PostgreSQL が 60 秒で起動しなかった" >&2; exit 1; }

if [ "${CLAUDE_CODE_REMOTE:-}" = true ] && [ "$(psql_on postgres "SELECT 1 FROM pg_roles WHERE rolname = '$user'")" != 1 ]; then
  # テストが CREATE DATABASE / DROP DATABASE をこのユーザでするので、開発用に superuser にする
  psql_on postgres "CREATE ROLE $user LOGIN SUPERUSER PASSWORD '$password'"
fi

url="postgresql+psycopg2://$user:$password@127.0.0.1:$port/$db"
if [ "$(psql_on postgres "SELECT 1 FROM pg_database WHERE datname = '$db'")" != 1 ]; then
  psql_on postgres "CREATE DATABASE $db OWNER $user ENCODING 'UTF8'"
  (cd source/back && DATABASE_URL="$url" "$py" -m alembic upgrade head >&2)
fi

echo "$url"
