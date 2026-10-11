"""add arrow_diameter_px to games

Revision ID: f20ca9ffe1db
Revises: b98d493d4b2d
Create Date: 2026-10-11 01:07:10.001884

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f20ca9ffe1db'
down_revision: str | None = 'b98d493d4b2d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 今ある記録は null(画面は既定の大きさで扱う)
    op.add_column('games', sa.Column('arrow_diameter_px', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('games', 'arrow_diameter_px')
