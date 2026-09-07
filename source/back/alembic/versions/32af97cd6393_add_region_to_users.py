"""add region to users

Revision ID: 32af97cd6393
Revises: 79c98b4298e3
Create Date: 2026-09-02 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '32af97cd6393'
down_revision: str | None = '79c98b4298e3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('region', sa.String(length=100), nullable=True))
        batch_op.create_index(op.f('ix_users_region'), ['region'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_index(op.f('ix_users_region'))
        batch_op.drop_column('region')
