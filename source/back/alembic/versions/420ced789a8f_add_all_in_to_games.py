"""add all_in to games

Revision ID: 420ced789a8f
Revises: f20ca9ffe1db
Create Date: 2026-10-11

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '420ced789a8f'
down_revision: str | None = 'f20ca9ffe1db'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 今ある記録は線にかかれば高い方の点で付けたので false
    op.add_column(
        'games',
        sa.Column('all_in', sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('games', 'all_in')
