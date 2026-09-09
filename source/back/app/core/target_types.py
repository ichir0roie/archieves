import re

from pydantic import BaseModel


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
