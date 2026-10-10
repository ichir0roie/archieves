"""add visibility to users

Revision ID: 81fcb9d86f50
Revises: d4f2a7c9e1b3
Create Date: 2026-10-10 23:50:30.680986

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '81fcb9d86f50'
down_revision: str | None = 'd4f2a7c9e1b3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 今いる利用者も非公開から始める(公開は本人が設定の画面で選ぶ)
    op.add_column(
        'users',
        sa.Column('profile_visibility', sa.String(length=20), server_default='private', nullable=False),
    )
    op.add_column(
        'users',
        sa.Column('ranking_visibility', sa.String(length=20), server_default='private', nullable=False),
    )


def downgrade() -> None:
    op.drop_column('users', 'ranking_visibility')
    op.drop_column('users', 'profile_visibility')
