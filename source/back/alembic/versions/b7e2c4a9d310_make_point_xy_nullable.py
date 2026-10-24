"""make point x y nullable

Revision ID: b7e2c4a9d310
Revises: 90faa51ca621
Create Date: 2026-10-24

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e2c4a9d310'
down_revision: str | None = '90faa51ca621'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 数字だけの入力の矢は位置を持たないので、x・y を null にできるようにする
    op.alter_column('points', 'x', existing_type=sa.Float(), nullable=True)
    op.alter_column('points', 'y', existing_type=sa.Float(), nullable=True)


def downgrade() -> None:
    # 位置の無い矢は、もとの「位置なし」の (0, 0) に戻す
    op.execute('UPDATE points SET x = 0, y = 0 WHERE x IS NULL OR y IS NULL')
    op.alter_column('points', 'x', existing_type=sa.Float(), nullable=False)
    op.alter_column('points', 'y', existing_type=sa.Float(), nullable=False)
