"""add comment tables

Revision ID: e5b7c1a9d240
Revises: db313dbb455c
Create Date: 2026-09-12 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5b7c1a9d240'
down_revision: str | None = 'db313dbb455c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), 'sqlite')

# Every comment table has the same shape; only the entity it annotates differs.
COMMENT_TABLES = [
    ('game_comments', 'game_id', 'games'),
    ('round_comments', 'round_id', 'rounds'),
    ('end_comments', 'end_id', 'ends'),
]


def upgrade() -> None:
    for table, parent_fk_col, parent_table in COMMENT_TABLES:
        op.create_table(
            table,
            sa.Column('id', BIGINT_PK, nullable=False),
            sa.Column(parent_fk_col, BIGINT_PK, nullable=False),
            sa.Column('user_id', BIGINT_PK, nullable=False),
            sa.Column('body', sa.String(length=1000), nullable=False),
            sa.Column(
                'created_at',
                sa.DateTime(timezone=True),
                server_default=sa.text('(CURRENT_TIMESTAMP)'),
                nullable=False,
            ),
            sa.Column('deleted_at', sa.Date(), nullable=True),
            sa.ForeignKeyConstraint([parent_fk_col], [f'{parent_table}.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(
            op.f(f'ix_{table}_{parent_fk_col}'), table, [parent_fk_col], unique=True
        )
        op.create_index(op.f(f'ix_{table}_user_id'), table, ['user_id'], unique=False)


def downgrade() -> None:
    for table, parent_fk_col, _ in reversed(COMMENT_TABLES):
        op.drop_index(op.f(f'ix_{table}_user_id'), table_name=table)
        op.drop_index(op.f(f'ix_{table}_{parent_fk_col}'), table_name=table)
        op.drop_table(table)
