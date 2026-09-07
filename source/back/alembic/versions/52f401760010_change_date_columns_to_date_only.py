"""change date columns to date-only

Revision ID: 52f401760010
Revises: b1c4e7a2f5d8
Create Date: 2026-09-06 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '52f401760010'
down_revision: str | None = 'b1c4e7a2f5d8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


RECORDED_AT_TABLES = ['games', 'rounds', 'ends', 'points']
DELETED_AT_TABLES = [
    'organizations', 'regions', 'genres', 'users', 'games', 'rounds', 'ends', 'points', 'matches',
]


def upgrade() -> None:
    for table in RECORDED_AT_TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.alter_column(
                'recorded_at',
                existing_type=sa.DateTime(timezone=True),
                type_=sa.Date(),
                postgresql_using='recorded_at::date',
            )
    for table in DELETED_AT_TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.alter_column(
                'deleted_at',
                existing_type=sa.DateTime(timezone=True),
                type_=sa.Date(),
                existing_nullable=True,
                postgresql_using='deleted_at::date',
            )


def downgrade() -> None:
    for table in DELETED_AT_TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.alter_column(
                'deleted_at',
                existing_type=sa.Date(),
                type_=sa.DateTime(timezone=True),
                existing_nullable=True,
            )
    for table in RECORDED_AT_TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.alter_column(
                'recorded_at',
                existing_type=sa.Date(),
                type_=sa.DateTime(timezone=True),
            )
