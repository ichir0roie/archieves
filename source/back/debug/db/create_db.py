# app.db.session ではなく app.db.base を読むのは、
# create_all の前に全部のモデルを Base.metadata に載せるため
from app.db.base import Base
from app.db.session import engine


def recreate_db() -> None:
    """Drop and recreate the database schema."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    recreate_db()
