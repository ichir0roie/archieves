#!/bin/bash
# web のセッションで、session-start.sh が裏で用意しているもの(venv・PostgreSQL・node_modules)を使うコマンドを、
# 用意が済むまで待たせる。git・ファイルを読むといった、どれも使わないコマンドは待たせない。
set -uo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = true ] || exit 0
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

setup_dir=.cache/session-setup
# 無ければ、このセッションは裏の用意を起こしていない(前のバージョンのフックで始まったなど)ので待つものが無い
[ -d "$setup_dir" ] || exit 0
# 用意が止まったことは一度だけ伝え、あとは通す(手で直したあとも止め続けないように)
[ -e "$setup_dir/reported" ] && exit 0

command=$(jq -r '.tool_input.command // ""')
need=()
grep -qE 'python|pytest|ruff|pyright|alembic|uvicorn|\.venv|tools\.|postgres\.sh|psql' <<< "$command" \
  && need+=(backend postgres)
grep -qE 'npm|npx|node |playwright|eslint|tsc|next ' <<< "$command" && need+=(frontend)
[ ${#need[@]} -gt 0 ] || exit 0

ready() {
  local marker
  for marker in "${need[@]}"; do
    [ -e "$setup_dir/$marker" ] || return 1
  done
}

for _ in $(seq 300); do
  ready && exit 0
  [ -e "$setup_dir/failed" ] && break
  sleep 1
done
ready && exit 0
touch "$setup_dir/reported"
{
  echo "テストの環境の用意が済んでいない(SessionStart フックが裏で回す .claude/hooks/session-start.sh)。"
  echo "ログ .cache/session-setup.log の末尾:"
  tail -n 20 .cache/session-setup.log 2>/dev/null
  echo "直してから .claude/scripts/setup-dev-env.sh を回すか、同じコマンドをもう一度打つ。"
} >&2
exit 2
