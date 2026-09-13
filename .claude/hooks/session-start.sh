#!/bin/bash
# Prepares the session's test environment (see .claude/scripts/setup-dev-env.sh).
#
# Asynchronous: the session starts immediately and this runs behind it, so a
# cold container's CPython download and npm install do not hold up the first
# prompt. The trade-off is that the environment may not be ready the instant
# the session is - run .claude/scripts/setup-dev-env.sh before testing if you
# are not sure; it is a sub-second no-op once this has finished, and the two
# cannot collide.
set -euo pipefail

echo '{"async": true, "asyncTimeout": 900000}'

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
exec "$REPO/.claude/scripts/setup-dev-env.sh"
