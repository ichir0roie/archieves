import os
import subprocess
import sys
from pathlib import Path

# Unlike the other debug/ scripts, this one isn't launched via a VSCode debug
# configuration (see ../db/create_db.py's comment) - it's meant to be run
# directly from a shell (e.g. a Claude Code cloud session), so app.* must be
# made importable explicitly regardless of the cwd it's run from.
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import uvicorn  # noqa: E402

DB_PATH = Path(__file__).resolve().parent / "test.db"


def main() -> None:
    os.environ["DATABASE_URL"] = f"sqlite:///{DB_PATH}"
    os.environ["AUTH_MODE"] = "mock"

    DB_PATH.unlink(missing_ok=True)

    subprocess.run(
        [sys.executable, str(PROJECT_ROOT / "debug" / "db" / "create_db.py")],
        check=True,
        cwd=PROJECT_ROOT,
    )

    uvicorn.run("app.main:app", host="0.0.0.0", port=8080)


if __name__ == "__main__":
    main()
