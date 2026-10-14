"""add diary_visibility to users

Revision ID: 3c7e9a1d5b20
Revises: 121b29940ce9
Create Date: 2026-10-13 12:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3c7e9a1d5b20'
down_revision: str | None = '121b29940ce9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 今いる利用者も非公開から始める(公開は本人が設定の画面で選ぶ)
    op.add_column(
        'users',
        sa.Column('diary_visibility', sa.String(length=20), server_default='private', nullable=False),
    )


def downgrade() -> None:
    op.drop_column('users', 'diary_visibility')
