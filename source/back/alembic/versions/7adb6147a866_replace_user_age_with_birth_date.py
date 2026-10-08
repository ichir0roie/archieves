"""replace user age with birth_date

Revision ID: 7adb6147a866
Revises: f1a8c3d5e792
Create Date: 2026-10-08 22:15:23.244172

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7adb6147a866'
down_revision: str | None = 'f1a8c3d5e792'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 年齢から生年月日は決まらないので、入っていた年齢は捨てる。利用者に生年月日を入れ直してもらう
    op.add_column('users', sa.Column('birth_date', sa.Date(), nullable=True))
    op.drop_column('users', 'age')


def downgrade() -> None:
    op.add_column('users', sa.Column('age', sa.INTEGER(), autoincrement=False, nullable=True))
    op.execute("UPDATE users SET age = date_part('year', age(birth_date))::int WHERE birth_date IS NOT NULL")
    op.drop_column('users', 'birth_date')
