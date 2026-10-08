from enum import StrEnum


class BowType(StrEnum):
    """弓の種類。ランキングの種目の軸。フロントの scoreConfig.ts の BOW_TYPES と揃える。"""

    BAREBOW = "barebow"
    COMPOUND = "compound"
    RECURVE = "recurve"


# games.bow_type の列の長さ。プリセット以外は自由入力の名前をこの長さまで持つ。
BOW_TYPE_MAX_LENGTH = 20
