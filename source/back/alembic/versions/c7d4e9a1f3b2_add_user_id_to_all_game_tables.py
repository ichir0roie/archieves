"""add user_id to all game tables

Revision ID: c7d4e9a1f3b2
Revises: 3f2248f7ff81
Create Date: 2026-09-07 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7d4e9a1f3b2'
down_revision: str | None = '3f2248f7ff81'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), 'sqlite')

# (table, column that points at its parent, parent table to backfill user_id from)
CHILD_TABLES = [
    ('rounds', 'game_id', 'games'),
    ('matches', 'game_id', 'games'),
]


def upgrade() -> None:
    # Games predate real auth wiring, so some local/dev rows may have no
    # owner; they can't be attributed to anyone, so they (and everything
    # under them, via the existing ON DELETE CASCADE foreign keys) are
    # dropped rather than left behind once user_id becomes mandatory.
    op.execute('DELETE FROM games WHERE user_id IS NULL')
    with op.batch_alter_table('games') as batch_op:
        batch_op.alter_column('user_id', existing_type=BIGINT_PK, nullable=False)

    for table, parent_fk_col, parent_table in CHILD_TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column('user_id', BIGINT_PK, nullable=True))
        op.execute(
            f'UPDATE {table} SET user_id = '
            f'(SELECT user_id FROM {parent_table} WHERE {parent_table}.id = {table}.{parent_fk_col})'
        )
        with op.batch_alter_table(table) as batch_op:
            batch_op.alter_column('user_id', existing_type=BIGINT_PK, nullable=False)
            batch_op.create_index(op.f(f'ix_{table}_user_id'), ['user_id'], unique=False)
            batch_op.create_foreign_key(
                f'fk_{table}_user_id_users',
                'users', ['user_id'], ['id'], ondelete='CASCADE',
            )

    # ends derive their user_id from rounds, which was just backfilled above.
    with op.batch_alter_table('ends') as batch_op:
        batch_op.add_column(sa.Column('user_id', BIGINT_PK, nullable=True))
    op.execute(
        'UPDATE ends SET user_id = '
        '(SELECT user_id FROM rounds WHERE rounds.id = ends.round_id)'
    )
    with op.batch_alter_table('ends') as batch_op:
        batch_op.alter_column('user_id', existing_type=BIGINT_PK, nullable=False)
        batch_op.create_index(op.f('ix_ends_user_id'), ['user_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_ends_user_id_users', 'users', ['user_id'], ['id'], ondelete='CASCADE',
        )

    # points derive their user_id from ends, which was just backfilled above.
    with op.batch_alter_table('points') as batch_op:
        batch_op.add_column(sa.Column('user_id', BIGINT_PK, nullable=True))
    op.execute(
        'UPDATE points SET user_id = '
        '(SELECT user_id FROM ends WHERE ends.id = points.end_id)'
    )
    with op.batch_alter_table('points') as batch_op:
        batch_op.alter_column('user_id', existing_type=BIGINT_PK, nullable=False)
        batch_op.create_index(op.f('ix_points_user_id'), ['user_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_points_user_id_users', 'users', ['user_id'], ['id'], ondelete='CASCADE',
        )


def downgrade() -> None:
    with op.batch_alter_table('points') as batch_op:
        batch_op.drop_constraint('fk_points_user_id_users', type_='foreignkey')
        batch_op.drop_index(op.f('ix_points_user_id'))
        batch_op.drop_column('user_id')

    with op.batch_alter_table('ends') as batch_op:
        batch_op.drop_constraint('fk_ends_user_id_users', type_='foreignkey')
        batch_op.drop_index(op.f('ix_ends_user_id'))
        batch_op.drop_column('user_id')

    for table, _parent_fk_col, _parent_table in CHILD_TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_constraint(f'fk_{table}_user_id_users', type_='foreignkey')
            batch_op.drop_index(op.f(f'ix_{table}_user_id'))
            batch_op.drop_column('user_id')

    with op.batch_alter_table('games') as batch_op:
        batch_op.alter_column('user_id', existing_type=BIGINT_PK, nullable=True)
