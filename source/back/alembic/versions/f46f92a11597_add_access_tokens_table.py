"""add access tokens table

Revision ID: f46f92a11597
Revises: 3c7e9a1d5b20
Create Date: 2026-10-17

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f46f92a11597'
down_revision: str | None = '3c7e9a1d5b20'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'access_tokens',
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('token_prefix', sa.String(length=8), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
    )
    op.create_index(op.f('ix_access_tokens_user_id'), 'access_tokens', ['user_id'], unique=False)
    # updated_at はほかの表と同じく db のトリガーが書き換える(マイグレーション a3d9f0b6c214)
    op.execute(
        'CREATE TRIGGER access_tokens_set_updated_at BEFORE UPDATE ON access_tokens '
        'FOR EACH ROW EXECUTE FUNCTION set_updated_at()'
    )


def downgrade() -> None:
    op.execute('DROP TRIGGER access_tokens_set_updated_at ON access_tokens')
    op.drop_index(op.f('ix_access_tokens_user_id'), table_name='access_tokens')
    op.drop_table('access_tokens')
