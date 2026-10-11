"""add shot_at to points and client_key to games

Revision ID: b98d493d4b2d
Revises: 81fcb9d86f50
Create Date: 2026-10-11 00:06:37.261142

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b98d493d4b2d'
down_revision: str | None = '81fcb9d86f50'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('games', sa.Column('client_key', sa.String(length=64), nullable=True))
    op.create_unique_constraint('uq_games_user_id_client_key', 'games', ['user_id', 'client_key'])
    op.add_column('points', sa.Column('shot_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('points', 'shot_at')
    op.drop_constraint('uq_games_user_id_client_key', 'games', type_='unique')
    op.drop_column('games', 'client_key')
