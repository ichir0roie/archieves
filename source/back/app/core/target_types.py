import re

from pydantic import BaseModel

from app.core.errors import UnprocessableError
from app.core.scoring import max_score_for_ring_count

# rounds.target_type の列の長さ。取り込んだ古い記録の値もこの長さに収める
TARGET_TYPE_MAX_LENGTH = 50


class TargetTypeConfig(BaseModel):
    """A selectable target face: its physical size and how many scoring rings it has."""

    id: str
    label: str
    size_cm: float
    color: str
    ring_count: int


# Fixed, hand-maintained list (mirrored in the frontend's scoreConfig.ts) so
# the input screens and the API agree on what target faces exist. Extend both
# lists together when a new face is added.
TARGET_TYPES: list[TargetTypeConfig] = [
    TargetTypeConfig(
        id="92cm",
        label="92cm",
        size_cm=92,
        color="#FFD700",
        ring_count=11,
    ),
    TargetTypeConfig(
        id="122cm",
        label="122cm(標準)",
        size_cm=122,
        color="#FFD700",
        ring_count=11,
    ),
    TargetTypeConfig(
        id="compound",
        label="コンパウンド用(80cm)",
        size_cm=80,
        color="#0057B8",
        ring_count=10,
    ),
]

TARGET_TYPE_IDS: list[str] = [t.id for t in TARGET_TYPES]

_TARGET_TYPES_BY_ID: dict[str, TargetTypeConfig] = {t.id: t for t in TARGET_TYPES}

_SIZE_CM_SUFFIX = re.compile(r"^(\d+(?:\.\d+)?)cm$")


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


def check_target_type(target_type_id: str) -> None:
    """決まった的の種類でなければ UnprocessableError(422)にする。"""
    if target_type_id not in TARGET_TYPE_IDS:
        raise UnprocessableError(f"target_type must be one of {TARGET_TYPE_IDS}")


def check_score_fits_target(target_type_id: str, score: int) -> None:
    """的が出せない点数(10 点までの的に X など)を UnprocessableError(422)にする。

    決まった的でない古いラウンド(取り込んだ記録)は輪の数が分からないので確かめない。
    """
    target_type = get_target_type(target_type_id)
    if target_type is None:
        return
    max_score = max_score_for_ring_count(target_type.ring_count)
    if score > max_score:
        raise UnprocessableError(
            f"score must be at most {max_score} on a {target_type_id} target"
        )
