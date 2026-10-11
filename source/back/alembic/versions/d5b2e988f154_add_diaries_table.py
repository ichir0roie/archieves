"""add diaries table

Revision ID: d5b2e988f154
Revises: 11313c9e5300
Create Date: 2026-10-11

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5b2e988f154'
down_revision: str | None = '11313c9e5300'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'diaries',
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('body', sa.String(length=10000), nullable=False),
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_diaries_user_id'), 'diaries', ['user_id'], unique=False)
    # updated_at はほかの表と同じく db のトリガーが書き換える(マイグレーション a3d9f0b6c214)
    op.execute(
        'CREATE TRIGGER diaries_set_updated_at BEFORE UPDATE ON diaries '
        'FOR EACH ROW EXECUTE FUNCTION set_updated_at()'
    )


def downgrade() -> None:
    op.execute('DROP TRIGGER diaries_set_updated_at ON diaries')
    op.drop_index(op.f('ix_diaries_user_id'), table_name='diaries')
    op.drop_table('diaries')
