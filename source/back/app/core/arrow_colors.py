"""矢のノック・羽根の色。写真モードで、同じ的に刺さったほかの人の矢と自分の矢を見分けるのに使う。

ゲームごとに持ち(弓の種類・矢の直径と同じく、入力の画面が前のゲームの値を引き継ぐ)、
画像の処理(app/services/photo_analysis.py)が色の範囲に直す。
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
