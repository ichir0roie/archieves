"""矢のノック・羽根の色。写真モードで、同じ的に刺さったほかの人の矢と自分の矢を見分けるのに使う。

ゲームごとに持ち(弓の種類・矢の直径と同じく、入力の画面が前のゲームの値を引き継ぐ)、
画像の処理(app/services/arrow_detection.py)が色の範囲に直す。

- ノックの色は、矢の色の登録の画面で、本人が撮った矢の写真から測った色(#rrggbb)。
  写真モードのゲームは、これが無いと始められない(画面が止める)
- 羽根の色は、決まった色の名前(ArrowColor)から選ぶ
"""

from enum import StrEnum


class ArrowColor(StrEnum):
    WHITE = "white"
    BLACK = "black"
    RED = "red"
    ORANGE = "orange"
    YELLOW = "yellow"
    GREEN = "green"
    BLUE = "blue"
    PURPLE = "purple"
    PINK = "pink"


ARROW_COLOR_MAX_LENGTH = 16
# ノックの色(#rrggbb、小文字)
NOCK_COLOR_PATTERN = r"^#[0-9a-f]{6}$"
