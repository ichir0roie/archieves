"""add game ai comments table

Revision ID: 90faa51ca621
Revises: f46f92a11597
Create Date: 2026-10-17

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '90faa51ca621'
down_revision: str | None = 'f46f92a11597'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'game_ai_comments',
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('game_id', sa.BigInteger(), nullable=False),
        sa.Column('body', sa.String(length=4000), nullable=False),
        sa.Column('author', sa.String(length=50), nullable=False),
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(['game_id'], ['games.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_game_ai_comments_game_id'), 'game_ai_comments', ['game_id'], unique=True)
    op.create_index(op.f('ix_game_ai_comments_user_id'), 'game_ai_comments', ['user_id'], unique=False)
    # updated_at はほかの表と同じく db のトリガーが書き換える(マイグレーション a3d9f0b6c214)
    op.execute(
        'CREATE TRIGGER game_ai_comments_set_updated_at BEFORE UPDATE ON game_ai_comments '
        'FOR EACH ROW EXECUTE FUNCTION set_updated_at()'
    )


def downgrade() -> None:
    op.execute('DROP TRIGGER game_ai_comments_set_updated_at ON game_ai_comments')
    op.drop_index(op.f('ix_game_ai_comments_user_id'), table_name='game_ai_comments')
    op.drop_index(op.f('ix_game_ai_comments_game_id'), table_name='game_ai_comments')
    op.drop_table('game_ai_comments')
