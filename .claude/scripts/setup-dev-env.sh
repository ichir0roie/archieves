#!/bin/bash
# Installs what the test suites need: a Python 3.14 virtualenv for the API's
# pytest suite, and the frontend's npm packages for Playwright. No docker and
# no postgres - the pytest suite builds its schema into an in-memory sqlite DB
# (see source/back/tests/conftest.py).
#
# Safe to run any time: it does nothing, in well under a second, once the
# environment already matches the dependency files. Run it before testing if
# you are not sure the session-start hook has finished.
#
#   ./.claude/scripts/setup-dev-env.sh            # both
#   ./.claude/scripts/setup-dev-env.sh backend    # just the Python venv
#   ./.claude/scripts/setup-dev-env.sh frontend   # just node_modules
set -euo pipefail

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
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

  # source/back/app uses PEP 695 syntax, so the container's own python3 (3.11)
  # cannot even import it; uv supplies the interpreter instead. Call uv as
  # `python3 -m uv`: the container already has an older uv earlier on PATH,
  # and that one resolves "3.14" to a release candidate whose private typing
  # API pydantic no longer works against.
  echo "setup-dev-env: installing uv and Python $PYTHON_VERSION"
  python3 -m pip install --quiet --upgrade uv
  python3 -m uv python install "$PYTHON_VERSION"

  if [ ! -x "$VENV/bin/python" ] ||
    ! "$VENV/bin/python" -c 'import sys; raise SystemExit(sys.version_info[:2] != (3, 14))'; then
    echo "setup-dev-env: creating $VENV"
    rm -rf "$VENV"
    python3 -m uv venv --python "$PYTHON_VERSION" "$VENV"
  fi

  echo "setup-dev-env: installing API dependencies"
  python3 -m uv pip install --quiet --python "$VENV/bin/python" -r "$BACK/requirements-dev.txt"
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

  # --no-save: a plain `npm install` rewrites package-lock.json metadata
  # (dropping integrity hashes for bundled deps), which has no business
  # happening here.
  echo "setup-dev-env: installing frontend packages"
  npm --prefix "$FRONT" install --no-save --no-audit --no-fund
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
