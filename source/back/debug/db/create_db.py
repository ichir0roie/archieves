import sys
from pathlib import Path

# app.db.base is imported (not app.db.session directly) so every model is
# registered on Base.metadata before create_all inspects it. app.* is resolved
# relative to the project root, not this debug/ dir, so make sure it's
# importable regardless of the cwd this script is launched from.
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from app.db.base import Base  # noqa: E402
from app.db.session import engine  # noqa: E402


def recreate_db() -> None:
    """Drop and recreate the database schema."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    recreate_db()
