#!/bin/bash
# web のセッション(CLAUDE_CODE_REMOTE=true)で、テストに要るもの(.claude/scripts/setup-dev-env.sh)と
# 手元の PostgreSQL(infra_local/postgres.sh)を裏で用意する。セッションは待たせずにすぐ戻る。
# 用意の進み具合は .cache/session-setup/ に印を置く(backend / postgres / frontend、止まれば failed)。
# .claude/hooks/wait-setup.sh(PreToolUse フック)が、それを使うコマンドを印が揃うまで待たせる。
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = true ] || exit 0
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

venv="$PWD/source/back/.venv"
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo 'export PYTHONUTF8=1'
    # python / pytest / ruff を 3.14 の venv のものにする
    echo "export PATH=\"$venv/bin:\$PATH\""
  } >> "$CLAUDE_ENV_FILE"
fi

setup_dir=.cache/session-setup
mkdir -p .cache
rm -rf "$setup_dir"
mkdir -p "$setup_dir"
setsid nohup bash -c '
  dir=$1
  { .claude/scripts/setup-dev-env.sh backend && touch "$dir/backend" \
    && infra_local/postgres.sh >/dev/null && touch "$dir/postgres"; } || touch "$dir/failed"
  .claude/scripts/setup-dev-env.sh frontend && touch "$dir/frontend" || touch "$dir/failed"
' setup "$setup_dir" >> .cache/session-setup.log 2>&1 < /dev/null &
echo "テストの環境を裏で用意している(ログは .cache/session-setup.log)" >&2
