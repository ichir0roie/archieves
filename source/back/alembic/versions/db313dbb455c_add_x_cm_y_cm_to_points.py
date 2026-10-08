"""add x_cm/y_cm to points

Revision ID: db313dbb455c
Revises: c7d4e9a1f3b2
Create Date: 2026-09-08 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'db313dbb455c'
down_revision: str | None = 'c7d4e9a1f3b2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('points') as batch_op:
        batch_op.add_column(sa.Column('x_cm', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('y_cm', sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('points') as batch_op:
        batch_op.drop_column('y_cm')
        batch_op.drop_column('x_cm')
