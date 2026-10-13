"""add score_visibility to users

Revision ID: 121b29940ce9
Revises: 58bf4faba0fe
Create Date: 2026-10-13 03:16:53.862904

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '121b29940ce9'
down_revision: str | None = '58bf4faba0fe'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 今いる利用者も非公開から始める(公開は本人が設定の画面で選ぶ)
    op.add_column(
        'users',
        sa.Column('score_visibility', sa.String(length=20), server_default='private', nullable=False),
    )


def downgrade() -> None:
    op.drop_column('users', 'score_visibility')
