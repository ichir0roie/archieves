from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy.orm import Session

from app.db.base import Base


def test_migrations_match_models(s: Session) -> None:
    # conftest はマイグレーションで表を作るので、
    # モデルだけを直してマイグレーションを足し忘れるとここで差が出る
    context = MigrationContext.configure(s.connection())
    assert compare_metadata(context, Base.metadata) == []
