"""replace arrow_diameter_px with arrow_diameter_mm

Revision ID: ac1668cc28ed
Revises: 36f35c57df82
Create Date: 2026-10-11 01:48:45.134417

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ac1668cc28ed'
down_revision: str | None = '36f35c57df82'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 画面の px は端末の大きさで mm との比が変わるので直せない。今ある値は捨てて null(既定の太さ)にする
    op.add_column('games', sa.Column('arrow_diameter_mm', sa.Integer(), nullable=True))
    op.drop_column('games', 'arrow_diameter_px')


def downgrade() -> None:
    op.add_column('games', sa.Column('arrow_diameter_px', sa.Integer(), nullable=True))
    op.drop_column('games', 'arrow_diameter_mm')
