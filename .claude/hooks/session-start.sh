#!/bin/bash
# Installs what the test suites need in a Claude Code on the web session:
# a Python 3.14 virtualenv for the API's pytest suite, and the frontend's
# npm packages for Playwright. Nothing here needs docker or postgres - the
# pytest suite builds its schema into an in-memory sqlite DB (see
# source/back/tests/conftest.py).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
BACK="$REPO/source/back"
FRONT="$REPO/source/front"
VENV="$BACK/.venv"
PYTHON_VERSION="3.14"

# source/back/app uses PEP 695 syntax, so the container's own python3 (3.11)
# cannot even import it; uv supplies the interpreter instead. Call uv as
# `python3 -m uv`: the container already has an older uv earlier on PATH, and
# that one resolves "3.14" to a release candidate whose private typing API
# pydantic no longer works against.
echo "session-start: installing uv"
python3 -m pip install --quiet --upgrade uv

echo "session-start: installing Python $PYTHON_VERSION"
python3 -m uv python install "$PYTHON_VERSION"

if [ ! -x "$VENV/bin/python" ] ||
  ! "$VENV/bin/python" -c 'import sys; raise SystemExit(sys.version_info[:2] != (3, 14))'; then
  echo "session-start: creating $VENV"
  rm -rf "$VENV"
  python3 -m uv venv --python "$PYTHON_VERSION" "$VENV"
fi

echo "session-start: installing API dependencies"
python3 -m uv pip install --quiet --python "$VENV/bin/python" -r "$BACK/requirements-dev.txt"

# Put the venv first on PATH for the rest of the session, so `python`,
# `pytest` and `ruff` are the 3.14 ones without spelling out .venv/bin.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$VENV/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

echo "session-start: installing frontend packages"
# --no-save: a plain `npm install` rewrites package-lock.json metadata
# (dropping integrity hashes for bundled deps), which has no business
# happening on session start.
npm --prefix "$FRONT" install --no-save --no-audit --no-fund

echo "session-start: done"
