"""rename compound target to 80cm

Revision ID: 91493a148c98
Revises: ac1668cc28ed
Create Date: 2026-10-11

"""
from collections.abc import Sequence

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '91493a148c98'
down_revision: str | None = 'ac1668cc28ed'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 的のプリセットを大きさの名前(122cm・80cm・40cm)にそろえた。"compound" は 80cm の的
    op.execute("UPDATE rounds SET target_type = '80cm' WHERE target_type = 'compound'")


def downgrade() -> None:
    # 書き換える前は API から 80cm を選べなかったので、80cm を全部 compound に戻す
    op.execute("UPDATE rounds SET target_type = 'compound' WHERE target_type = '80cm'")
