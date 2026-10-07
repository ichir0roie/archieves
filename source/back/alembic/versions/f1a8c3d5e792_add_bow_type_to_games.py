"""add bow_type to games

Revision ID: f1a8c3d5e792
Revises: e5b7c1a9d240
Create Date: 2026-10-07 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a8c3d5e792'
down_revision: str | None = 'e5b7c1a9d240'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('games', sa.Column('bow_type', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('games', 'bow_type')
