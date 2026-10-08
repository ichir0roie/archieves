import pandas as pd
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crud import user as user_crud
from app.db import Point
from app.schemas.user import UserCreate
from app.services.legacy_import import (
    LegacyImportError,
    import_legacy_backup,
)

TRAINING = pd.DataFrame([{"id": 1, "date": "2026-01-01"}])
ROUNDS = pd.DataFrame(
    [
        {
            "id": 10,
            "trainingId": 1,
            "index": 1,
            "shotsPerEnd": 3,
            "maxEndCount": 6,
            "distance": "30m",
        }
    ]
)
ENDS = pd.DataFrame([{"id": 100, "roundId": 10, "index": 1}])
SHOTS = pd.DataFrame(
    [{"id": 1000, "endId": 100, "index": 1, "scoringRing": 2, "x": 0.5, "y": 0.5}]
)


@pytest.fixture()
def user_id(s: Session) -> int:
    return user_crud.create_user(s, UserCreate(name="Yumi")).id


def _import(
    s: Session,
    user_id: int,
    *,
    training: pd.DataFrame | None = None,
    rounds: pd.DataFrame | None = None,
    ends: pd.DataFrame | None = None,
    shots: pd.DataFrame | None = None,
):
    return import_legacy_backup(
        s,
        training=TRAINING if training is None else training,
        rounds=ROUNDS if rounds is None else rounds,
        ends=ENDS if ends is None else ends,
        shots=SHOTS if shots is None else shots,
        user_id=user_id,
    )


def test_imports_every_table(s: Session, user_id: int) -> None:
    summary = _import(s, user_id)

    assert (summary.games, summary.rounds, summary.ends, summary.points) == (1, 1, 1, 1)


def test_unresolved_negative_scoring_ring_is_kept_as_is(
    s: Session, user_id: int
) -> None:
    from app.db import Point

    shots = pd.DataFrame(
        [{"id": 1, "endId": 100, "index": 1, "scoringRing": -1, "x": 0.0, "y": 0.0}]
    )
    _import(s, user_id, shots=shots)

    assert s.query(Point).one().score == -1


def test_a_missing_round_size_becomes_null(s: Session, user_id: int) -> None:
    from app.db import Round

    rounds = ROUNDS.assign(maxEndCount=[None])
    _import(s, user_id, rounds=rounds)

    assert s.query(Round).one().round_size is None


def test_unparsable_date_reports_the_training_table(
    s: Session, user_id: int
) -> None:
    training = pd.DataFrame([{"id": 1, "date": "not-a-date"}])

    with pytest.raises(LegacyImportError, match="'training' table"):
        _import(s, user_id, training=training)


def test_missing_training_column_reports_the_training_table(
    s: Session, user_id: int
) -> None:
    training = pd.DataFrame([{"id": 1}])

    with pytest.raises(LegacyImportError, match="'training' table"):
        _import(s, user_id, training=training)


def test_unparsable_distance_is_rejected(s: Session, user_id: int) -> None:
    rounds = ROUNDS.assign(distance=["far away"])

    with pytest.raises(LegacyImportError, match="distance in meters"):
        _import(s, user_id, rounds=rounds)


def test_round_referencing_an_unknown_training_reports_the_round_table(
    s: Session, user_id: int
) -> None:
    rounds = ROUNDS.assign(trainingId=[999])

    with pytest.raises(LegacyImportError, match="'round' table"):
        _import(s, user_id, rounds=rounds)


def test_end_referencing_an_unknown_round_reports_the_end_table(
    s: Session, user_id: int
) -> None:
    ends = ENDS.assign(roundId=[999])

    with pytest.raises(LegacyImportError, match="'end' table"):
        _import(s, user_id, ends=ends)


def test_shot_referencing_an_unknown_end_reports_the_shot_table(
    s: Session, user_id: int
) -> None:
    shots = SHOTS.assign(endId=[999])

    with pytest.raises(LegacyImportError, match="'shot' table"):
        _import(s, user_id, shots=shots)


def test_converts_mytargets_coordinates_to_target_fractions(s: Session, user_id: int) -> None:
    # MyTargets は中心 0・縁 ±1。中心・右下の縁・的の外(縁に寄せる)を見る
    shots = pd.DataFrame(
        [
            {"id": 1, "endId": 100, "index": 1, "scoringRing": 0, "x": 0.0, "y": 0.0},
            {"id": 2, "endId": 100, "index": 2, "scoringRing": 10, "x": 1.0, "y": 1.0},
            {"id": 3, "endId": 100, "index": 3, "scoringRing": -1, "x": -1.4, "y": 0.5},
        ]
    )
    _import(s, user_id, shots=shots)

    points = s.scalars(select(Point).where(Point.user_id == user_id).order_by(Point.number)).all()
    assert [(p.x, p.y) for p in points] == [
        (0.5, 0.5),
        (1.0, 1.0),
        (0.0, 0.75),
    ]
