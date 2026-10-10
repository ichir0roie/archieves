"""drop matches table

大会の情報の機能を消した。

Revision ID: b8e2c4d7f915
Revises: a3d9f0b6c214
Create Date: 2026-10-10 21:25:17.649344

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b8e2c4d7f915'
down_revision: str | None = 'a3d9f0b6c214'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index(op.f('ix_matches_game_id'), table_name='matches')
    op.drop_index(op.f('ix_matches_user_id'), table_name='matches')
    op.drop_table('matches')


def downgrade() -> None:
    op.create_table('matches',
    sa.Column('game_id', sa.BIGINT(), autoincrement=False, nullable=False),
    sa.Column('name', sa.VARCHAR(length=200), autoincrement=False, nullable=False),
    sa.Column('link', sa.VARCHAR(length=500), autoincrement=False, nullable=True),
    sa.Column('id', sa.BIGINT(), autoincrement=True, nullable=False),
    sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), autoincrement=False, nullable=False),
    sa.Column('deleted_at', sa.DATE(), autoincrement=False, nullable=True),
    sa.Column('user_id', sa.BIGINT(), autoincrement=False, nullable=False),
    sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['game_id'], ['games.id'], name=op.f('matches_game_id_fkey'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_matches_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('matches_pkey'))
    )
    op.create_index(op.f('ix_matches_user_id'), 'matches', ['user_id'], unique=False)
    op.create_index(op.f('ix_matches_game_id'), 'matches', ['game_id'], unique=True)
    # a3d9f0b6c214 の downgrade が消すトリガーを付け直す
    op.execute(
        'CREATE TRIGGER matches_set_updated_at BEFORE UPDATE ON matches '
        'FOR EACH ROW EXECUTE FUNCTION set_updated_at()'
    )
