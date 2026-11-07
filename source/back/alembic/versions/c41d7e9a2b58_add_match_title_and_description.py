"""add match title and description

試合に、作った人が付けるタイトルと内容(説明)を足す。どちらも省ける。

Revision ID: c41d7e9a2b58
Revises: 11ab537ec969
Create Date: 2026-11-07 20:30:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c41d7e9a2b58'
down_revision: str | None = '11ab537ec969'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('matches', sa.Column('title', sa.String(length=100), nullable=True))
    op.add_column('matches', sa.Column('description', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('matches', 'description')
    op.drop_column('matches', 'title')
