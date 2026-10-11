import pytest

from app.core.errors import UnprocessableError
from app.core.target_types import (
    TARGET_TYPE_IDS,
    TARGET_TYPES,
    check_target_type,
    current_target_type_id,
    get_target_type,
    is_custom_target_type,
    resolve_target_size_cm,
)


def test_ids_match_the_configured_target_types() -> None:
    assert TARGET_TYPE_IDS == [t.id for t in TARGET_TYPES]


@pytest.mark.parametrize("target_type_id", TARGET_TYPE_IDS)
def test_every_configured_target_type_is_resolvable(target_type_id: str) -> None:
    config = get_target_type(target_type_id)

    assert config is not None
    assert config.size_cm > 0
    assert resolve_target_size_cm(target_type_id) == config.size_cm


def test_get_target_type_returns_none_for_an_unknown_face() -> None:
    assert get_target_type("unknown") is None


@pytest.mark.parametrize(
    ("target_type_id", "expected"),
    [
        ("122cm", 122.0),
        ("80cm", 80.0),
        ("40cm", 40.0),
        ("92cm", 92.0),
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


def test_the_presets_are_the_world_archery_faces() -> None:
    assert TARGET_TYPE_IDS == ["122cm", "80cm", "40cm"]


@pytest.mark.parametrize(
    ("target_type_id", "expected"),
    [
        ("compound", "80cm"),
        ("122cm", "122cm"),
        ("92cm", "92cm"),
        ("unknown", "unknown"),
    ],
)
def test_current_target_type_id_renames_the_old_compound_face(
    target_type_id: str,
    expected: str,
) -> None:
    assert current_target_type_id(target_type_id) == expected


@pytest.mark.parametrize("target_type_id", ["10cm", "60cm", "92cm", "200cm"])
def test_an_integer_diameter_in_range_is_an_other_target_type(target_type_id: str) -> None:
    assert is_custom_target_type(target_type_id)
    check_target_type(target_type_id)


@pytest.mark.parametrize(
    "target_type_id",
    ["9cm", "201cm", "60.5cm", "060cm", "60", "cm", "compound", "unknown", ""],
)
def test_other_values_are_rejected(target_type_id: str) -> None:
    assert not is_custom_target_type(target_type_id)
    with pytest.raises(UnprocessableError):
        check_target_type(target_type_id)
