"""add is_admin to users

管理者は db の行を直に書き換えて決める(UPDATE users SET is_admin = true WHERE ...)。

Revision ID: d4f2a7c9e1b3
Revises: b8e2c4d7f915
Create Date: 2026-10-10 23:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd4f2a7c9e1b3'
down_revision: str | None = 'b8e2c4d7f915'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'is_admin')
