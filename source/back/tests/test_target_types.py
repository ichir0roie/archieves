import pytest

from app.core.scoring import max_score_for_ring_count
from app.core.target_types import (
    TARGET_TYPE_IDS,
    TARGET_TYPES,
    get_target_type,
    resolve_target_size_cm,
)


def test_ids_match_the_configured_target_types() -> None:
    assert TARGET_TYPE_IDS == [t.id for t in TARGET_TYPES]


@pytest.mark.parametrize("target_type_id", TARGET_TYPE_IDS)
def test_every_configured_target_type_is_resolvable(target_type_id: str) -> None:
    config = get_target_type(target_type_id)

    assert config is not None
    assert config.size_cm > 0
    assert config.ring_count > 0
    assert resolve_target_size_cm(target_type_id) == config.size_cm


def test_get_target_type_returns_none_for_an_unknown_face() -> None:
    assert get_target_type("unknown") is None


@pytest.mark.parametrize(
    ("target_type_id", "expected"),
    [
        ("122cm", 122.0),
        ("compound", 80.0),
        ("40cm", 40.0),
        ("60.5cm", 60.5),
    ],
)
def test_resolve_target_size_cm_reads_legacy_bare_sizes(
    target_type_id: str, expected: float
) -> None:
    assert resolve_target_size_cm(target_type_id) == expected


@pytest.mark.parametrize("target_type_id", ["unknown", "", "cm", "30m", "30 cm"])
def test_resolve_target_size_cm_returns_none_when_unparsable(target_type_id: str) -> None:
    assert resolve_target_size_cm(target_type_id) is None


@pytest.mark.parametrize(
    ("ring_count", "expected"),
    [
        (11, 11),
        (10, 10),
        (5, 5),
    ],
)
def test_max_score_for_ring_count(ring_count: int, expected: int) -> None:
    assert max_score_for_ring_count(ring_count) == expected
