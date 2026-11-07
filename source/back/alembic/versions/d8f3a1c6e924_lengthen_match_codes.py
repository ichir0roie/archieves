"""lengthen match codes

試合の id(参加のコード)を「開催日-作った人の id-試合の番号-ランダムな 8 字」にし、
作りの上で重ならないようにする。番号の連番を足し、id と games.match_id の長さを広げる。
前に作った 8 字の試合はそのまま残す。

Revision ID: d8f3a1c6e924
Revises: c41d7e9a2b58
Create Date: 2026-11-07 21:20:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8f3a1c6e924'
down_revision: str | None = 'c41d7e9a2b58'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.schema.CreateSequence(sa.Sequence('matches_number_seq')))
    # 参照される側(matches.id)と参照する側(games.match_id)を同じ長さに広げる。
    # varchar を長くするだけなので、外部キーは張ったままでよい
    op.alter_column('matches', 'id', type_=sa.String(length=64), existing_type=sa.String(length=8))
    op.alter_column(
        'games', 'match_id', type_=sa.String(length=64), existing_type=sa.String(length=8)
    )


def downgrade() -> None:
    # 8 字より長いコードの試合があると戻せない(縮めると切れる)。戻すのは手元の db だけの想定
    op.alter_column(
        'games', 'match_id', type_=sa.String(length=8), existing_type=sa.String(length=64)
    )
    op.alter_column('matches', 'id', type_=sa.String(length=8), existing_type=sa.String(length=64))
    op.execute(sa.schema.DropSequence(sa.Sequence('matches_number_seq')))
