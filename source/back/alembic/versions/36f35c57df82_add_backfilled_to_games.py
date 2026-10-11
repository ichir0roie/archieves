"""add backfilled to games

Revision ID: 36f35c57df82
Revises: 420ced789a8f
Create Date: 2026-10-11

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36f35c57df82'
down_revision: str | None = '420ced789a8f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 今ある記録は、どれも入れた時の日付・時刻で付けたので false
    op.add_column(
        'games',
        sa.Column('backfilled', sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('games', 'backfilled')
