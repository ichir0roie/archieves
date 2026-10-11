import re

from pydantic import BaseModel

from app.core.errors import UnprocessableError

# rounds.target_type の列の長さ。取り込んだ古い記録の値もこの長さに収める
TARGET_TYPE_MAX_LENGTH = 50

# その他の的の直径(cm)。"<直径>cm" の名前で持ち、大きさは名前から読む(resolve_target_size_cm)。
# フロントの scoreConfig.ts の MIN/MAX_TARGET_SIZE_CM と揃える
MIN_TARGET_SIZE_CM = 10
MAX_TARGET_SIZE_CM = 200


class TargetTypeConfig(BaseModel):
    """選べる的。どの的も X と 1〜10 点の帯を持ち、違うのは大きさだけ。"""

    id: str
    size_cm: float


# World Archery のよく使う大きさ(122cm は屋外のリカーブ、80cm は屋外の短い距離とコンパウンド、
# 40cm は屋内 18m)。フロントの scoreConfig.ts の TARGET_TYPES と揃える(足すときは両方に足す)。
# 以前の "92cm" の記録は選べない古い的として残り、大きさは名前から読む(resolve_target_size_cm)
TARGET_TYPES: list[TargetTypeConfig] = [
    TargetTypeConfig(
        id="122cm",
        size_cm=122,
    ),
    TargetTypeConfig(
        id="80cm",
        size_cm=80,
    ),
    TargetTypeConfig(
        id="40cm",
        size_cm=40,
    ),
]

TARGET_TYPE_IDS: list[str] = [t.id for t in TARGET_TYPES]

# 名前を変えた的。db はマイグレーション(91493a148c98)で書き換えたが、それより前に書き出した
# ファイルを取り込むと古い名前で入ってくる。フロントの scoreConfig.ts の RENAMED_TARGET_TYPES と
# 揃える
_RENAMED_TARGET_TYPES = {
    "compound": "80cm",
}

_TARGET_TYPES_BY_ID: dict[str, TargetTypeConfig] = {t.id: t for t in TARGET_TYPES}

_SIZE_CM_SUFFIX = re.compile(r"^(\d+(?:\.\d+)?)cm$")
_CUSTOM_SIZE_CM = re.compile(r"^([1-9]\d*)cm$")

TARGET_TYPE_ERROR = (
    f"target_type must be one of {TARGET_TYPE_IDS}"
    f" or '<n>cm' with an integer n from {MIN_TARGET_SIZE_CM} to {MAX_TARGET_SIZE_CM}"
)


def current_target_type_id(target_type_id: str) -> str:
    """名前を変えた的を今の名前にする。それ以外はそのまま返す。"""
    return _RENAMED_TARGET_TYPES.get(target_type_id, target_type_id)


def get_target_type(target_type_id: str) -> TargetTypeConfig | None:
    return _TARGET_TYPES_BY_ID.get(target_type_id)


def resolve_target_size_cm(target_type_id: str) -> float | None:
    """The face's physical size in cm, for target types predating this fixed
    list (e.g. legacy-imported rounds) whose target_type is a bare "<n>cm"
    string rather than one of TARGET_TYPE_IDS."""
    known = _TARGET_TYPES_BY_ID.get(target_type_id)
    if known is not None:
        return known.size_cm
    match = _SIZE_CM_SUFFIX.match(target_type_id)
    return float(match.group(1)) if match else None


def is_custom_target_type(target_type_id: str) -> bool:
    """その他の的("<直径>cm"。直径は MIN〜MAX_TARGET_SIZE_CM の整数)か。"""
    match = _CUSTOM_SIZE_CM.match(target_type_id)
    return match is not None and MIN_TARGET_SIZE_CM <= int(match.group(1)) <= MAX_TARGET_SIZE_CM


def check_target_type(target_type_id: str) -> None:
    """決まった的の種類でも、その他の的でもなければ UnprocessableError(422)にする。"""
    if target_type_id not in TARGET_TYPE_IDS and not is_custom_target_type(target_type_id):
        raise UnprocessableError(TARGET_TYPE_ERROR)
