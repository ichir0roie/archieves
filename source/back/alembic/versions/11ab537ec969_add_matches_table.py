"""add matches table

試合(だれかが日時と矢の数を決め、参加する人がその id(コード)でゲームを始める)を足す。

Revision ID: 11ab537ec969
Revises: b7e2c4a9d310
Create Date: 2026-11-07 18:10:20.854565

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '11ab537ec969'
down_revision: str | None = 'b7e2c4a9d310'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # id は推測されにくい 8 字のコード(app/core/match_codes.py)。揃えるのは矢の数と日時だけで、
    # 弓・距離・的などは参加する人のゲームが持つ
    op.create_table('matches',
    sa.Column('id', sa.String(length=8), nullable=False),
    sa.Column('organizer_id', sa.BigInteger(), nullable=True),
    sa.Column('held_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('game_size', sa.Integer(), nullable=False),
    sa.Column('round_size', sa.Integer(), nullable=False),
    sa.Column('end_size', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('deleted_at', sa.Date(), nullable=True),
    sa.ForeignKeyConstraint(['organizer_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_matches_organizer_id'), 'matches', ['organizer_id'], unique=False)
    op.add_column('games', sa.Column('match_id', sa.String(length=8), nullable=True))
    op.create_index(op.f('ix_games_match_id'), 'games', ['match_id'], unique=False)
    op.create_foreign_key(
        'games_match_id_fkey', 'games', 'matches', ['match_id'], ['id'], ondelete='SET NULL'
    )
    # updated_at はほかの表と同じく db のトリガーが書き換える(マイグレーション a3d9f0b6c214)
    op.execute(
        'CREATE TRIGGER matches_set_updated_at BEFORE UPDATE ON matches '
        'FOR EACH ROW EXECUTE FUNCTION set_updated_at()'
    )


def downgrade() -> None:
    op.execute('DROP TRIGGER matches_set_updated_at ON matches')
    op.drop_constraint('games_match_id_fkey', 'games', type_='foreignkey')
    op.drop_index(op.f('ix_games_match_id'), table_name='games')
    op.drop_column('games', 'match_id')
    op.drop_index(op.f('ix_matches_organizer_id'), table_name='matches')
    op.drop_table('matches')
