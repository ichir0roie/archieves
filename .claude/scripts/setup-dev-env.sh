#!/bin/bash
# テストに要るものを入れる: API の Python 3.14 の venv(source/back/.venv)と、
# フロントの node_modules。PostgreSQL は infra_local/postgres.sh が用意する。
#
# 何度回してもよい。依存のファイルが変わっていなければ 1 秒かからずに何もせず終わる。
# web のセッションでは .claude/hooks/session-start.sh が裏で回す。
#
#   ./.claude/scripts/setup-dev-env.sh            # both
#   ./.claude/scripts/setup-dev-env.sh backend    # just the Python venv
#   ./.claude/scripts/setup-dev-env.sh frontend   # just node_modules
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACK="$REPO/source/back"
FRONT="$REPO/source/front"
VENV="$BACK/.venv"
PYTHON_VERSION="3.14"
TARGET="${1:-all}"

# The session-start hook runs this in the background while the session is
# already usable, so a hand-run can land on top of it. Two uv installs into
# one venv would corrupt it, so only one run works at a time; the other waits.
LOCK="${TMPDIR:-/tmp}/archieves-setup-dev-env.lock"
exec 9>"$LOCK"
flock 9

stamp_of() {
  cat "$@" 2>/dev/null | sha256sum | cut -d' ' -f1
}

setup_backend() {
  local stamp_file="$VENV/.dependency-stamp"
  local want
  want="$(stamp_of "$BACK/requirements.txt" "$BACK/requirements-dev.txt")"

  if [ -x "$VENV/bin/python" ] &&
    "$VENV/bin/python" -c 'import sys; raise SystemExit(sys.version_info[:2] != (3, 14))' &&
    [ "$(cat "$stamp_file" 2>/dev/null)" = "$want" ]; then
    echo "setup-dev-env: backend already up to date"
    return
  fi

  # app/ は PEP 695 の構文を使うので、コンテナの python3(3.11)では import もできない。
  # python 本体は uv に取ってこさせる。PATH の素の uv は古く、"3.14" を rc のバージョンに解いて
  # pydantic が落ちるので、uvx で新しめの uv を使う
  local uv=(uvx -q --from 'uv>=0.9' uv)

  if [ ! -x "$VENV/bin/python" ] ||
    ! "$VENV/bin/python" -c 'import sys; raise SystemExit(sys.version_info[:2] != (3, 14))'; then
    echo "setup-dev-env: creating $VENV"
    rm -rf "$VENV"
    "${uv[@]}" venv --python "$PYTHON_VERSION" "$VENV"
  fi

  echo "setup-dev-env: installing API dependencies"
  "${uv[@]}" pip install --python "$VENV/bin/python" -r "$BACK/requirements-dev.txt"
  echo "$want" > "$stamp_file"
}

setup_frontend() {
  local stamp_file="$FRONT/node_modules/.dependency-stamp"
  local want
  want="$(stamp_of "$FRONT/package-lock.json")"

  if [ -d "$FRONT/node_modules" ] && [ "$(cat "$stamp_file" 2>/dev/null)" = "$want" ]; then
    echo "setup-dev-env: frontend already up to date"
    return
  fi

  # npm install は package-lock.json を書き換えることがあるので、lock のとおりに入れる npm ci を使う
  echo "setup-dev-env: installing frontend packages"
  npm --prefix "$FRONT" ci --no-audit --no-fund
  echo "$want" > "$stamp_file"
}

case "$TARGET" in
  all) setup_backend; setup_frontend ;;
  backend) setup_backend ;;
  frontend) setup_frontend ;;
  *) echo "usage: ${BASH_SOURCE[0]##*/} [all|backend|frontend]" >&2; exit 2 ;;
esac

# Put the venv first on PATH for the rest of the session, so `python`,
# `pytest` and `ruff` are the 3.14 ones without spelling out .venv/bin.
if [ -n "${CLAUDE_ENV_FILE:-}" ] && ! grep -qF "$VENV/bin" "$CLAUDE_ENV_FILE" 2>/dev/null; then
  echo "export PATH=\"$VENV/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

echo "setup-dev-env: done"
