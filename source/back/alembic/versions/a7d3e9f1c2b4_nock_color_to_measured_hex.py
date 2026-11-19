"""nock color to measured hex

ノックの色を、色の名前から、本人の矢の写真から測った色(#rrggbb)に替える。
列の型は同じ(String(16))なので、入っている名前を、その色の代表の値に置き換えるだけ。
代表の値は、それまで画像の処理が名前ごとに探していた色の範囲の真ん中あたり。

Revision ID: a7d3e9f1c2b4
Revises: c379358a713f
Create Date: 2026-11-19 12:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7d3e9f1c2b4"
down_revision: str | None = "c379358a713f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NAMED_COLORS = {
    "white": "#f5f5f5",
    "black": "#232323",
    "red": "#e02020",
    "orange": "#ff7a00",
    "yellow": "#ffe000",
    "green": "#3cff28",
    "blue": "#1e64e1",
    "purple": "#8c28c8",
    "pink": "#ff3cb4",
}


def upgrade() -> None:
    for name, hex_color in NAMED_COLORS.items():
        op.execute(
            f"UPDATE games SET nock_color = '{hex_color}' WHERE nock_color = '{name}'"
        )


def downgrade() -> None:
    # 測った色は名前に戻せない。代表の値のままのものだけ名前に戻し、ほかは決めていない扱いにする
    for name, hex_color in NAMED_COLORS.items():
        op.execute(
            f"UPDATE games SET nock_color = '{name}' WHERE nock_color = '{hex_color}'"
        )
    op.execute("UPDATE games SET nock_color = NULL WHERE nock_color LIKE '#%'")
