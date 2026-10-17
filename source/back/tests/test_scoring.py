from datetime import date

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.scoring import MAX_RING_SCORE, MISS_SCORE, X_SCORE, scored_value
from app.core.target_types import TARGET_TYPE_IDS
from app.crud import user as user_crud
from app.db import Point
from app.schemas.game import PointCreate, PointUpdate
from app.schemas.game_sheet import PointSheetWrite
from app.schemas.user import UserCreate

RECORDED_AT = "2026-01-01T00:00:00Z"


def _create_game(client: TestClient) -> dict:
    res = client.post("/api/v1/games", json={"recorded_at": RECORDED_AT})
    assert res.status_code == 201
    return res.json()


def _create_round(client: TestClient, game_id: int, *, target_type: str = "122cm") -> dict:
    payload = {
        "number": 1,
        "recorded_at": RECORDED_AT,
        "end_size": 6,
        "round_size": 6,
        "distance_m": 70,
        "target_type": target_type,
    }
    res = client.post(f"/api/v1/games/{game_id}/rounds", json=payload)
    assert res.status_code == 201
    return res.json()


def _create_end(client: TestClient, round_id: int) -> dict:
    res = client.post(
        f"/api/v1/rounds/{round_id}/ends",
        json={"number": 1, "recorded_at": RECORDED_AT},
    )
    assert res.status_code == 201
    return res.json()


def _post_point(client: TestClient, end_id: int, *, score: int, number: int = 1):
    return client.post(
        f"/api/v1/ends/{end_id}/points",
        json={"number": number, "score": score, "x": 0.0, "y": 0.0, "recorded_at": RECORDED_AT},
    )


def _end_of_scores(client: TestClient, scores: list[int], *, target_type: str = "122cm") -> dict:
    game = _create_game(client)
    round_ = _create_round(client, game["id"], target_type=target_type)
    end = _create_end(client, round_["id"])
    for number, score in enumerate(scores, start=1):
        assert _post_point(client, end["id"], score=score, number=number).status_code == 201
    return end


@pytest.mark.parametrize(
    ("stored", "expected"),
    [
        (X_SCORE, MAX_RING_SCORE),
        (MAX_RING_SCORE, MAX_RING_SCORE),
        (1, 1),
        (MISS_SCORE, MISS_SCORE),
        (-3, MISS_SCORE),
    ],
)
def test_scored_value_maps_a_stored_ring_to_points(stored: int, expected: int) -> None:
    assert scored_value(stored) == expected


def test_an_x_is_worth_ten_in_round_and_end_totals(client: TestClient) -> None:
    _end_of_scores(client, [X_SCORE] * 6)

    rounds = client.get("/api/v1/statistics/rounds").json()
    assert rounds[0]["total_score"] == 60
    assert rounds[0]["average_score"] == 10.0

    ends = client.get("/api/v1/statistics/ends").json()
    assert ends[0]["total_score"] == 60
    assert ends[0]["average_score"] == 10.0


def test_an_x_is_worth_ten_in_the_point_summary(client: TestClient) -> None:
    _end_of_scores(client, [X_SCORE, X_SCORE, 8])

    body = client.get("/api/v1/statistics/points/summary").json()
    assert body["max"] == MAX_RING_SCORE
    assert body["total"] == 28


def test_an_x_is_worth_ten_in_the_ranking(client: TestClient, current_user) -> None:
    current_user.ranking_visibility = "public"
    _end_of_scores(client, [X_SCORE] * 6)

    body = client.get("/api/v1/public/ranking").json()
    assert body[0]["value"] == 60.0


def test_a_legacy_negative_score_counts_as_a_miss(client: TestClient, s: Session) -> None:
    end = _end_of_scores(client, [9])
    # legacy_import writes rows straight through SQLAlchemy, so an
    # unresolved ring from an old backup can reach the DB as a negative score.
    s.add(
        Point(
            end_id=end["id"],
            user_id=end["user_id"],
            number=2,
            score=-1,
            x=0,
            y=0,
            recorded_at=date(2026, 1, 1),
        )
    )
    s.commit()

    ends = client.get("/api/v1/statistics/ends").json()
    assert ends[0]["arrow_count"] == 2
    assert ends[0]["total_score"] == 9


def test_a_score_above_x_is_rejected(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])

    assert _post_point(client, end["id"], score=12).status_code == 422
    assert _post_point(client, end["id"], score=-1).status_code == 422


@pytest.mark.parametrize("target_type", TARGET_TYPE_IDS)
def test_every_target_type_takes_an_x(client: TestClient, target_type: str) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"], target_type=target_type)
    end = _create_end(client, round_["id"])
    point = _post_point(client, end["id"], score=9).json()

    assert _post_point(client, end["id"], score=X_SCORE).status_code == 201
    res = client.patch(f"/api/v1/points/{point['id']}", json={"score": X_SCORE})
    assert res.status_code == 200


def test_a_miss_outside_the_target_keeps_its_position(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])

    res = client.post(
        f"/api/v1/ends/{end['id']}/points",
        json={"number": 1, "score": MISS_SCORE, "x": 1.5, "y": -2.5, "recorded_at": RECORDED_AT},
    )
    assert res.status_code == 201
    body = res.json()
    assert (body["x"], body["y"]) == (1.5, -2.5)
    assert body["x_cm"] == pytest.approx(122.0)
    assert body["y_cm"] == pytest.approx(-366.0)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_a_non_finite_position_is_rejected(value: float) -> None:
    with pytest.raises(ValidationError):
        PointCreate(number=1, score=MISS_SCORE, x=value, y=0.5, recorded_at=RECORDED_AT)
    with pytest.raises(ValidationError):
        PointUpdate(y=value)
    with pytest.raises(ValidationError):
        PointSheetWrite(number=1, score=MISS_SCORE, x=0.5, y=value, recorded_at=RECORDED_AT)


def test_a_game_of_zero_rounds_is_rejected(client: TestClient) -> None:
    res = client.post(
        "/api/v1/games",
        json={"recorded_at": RECORDED_AT, "game_size": 0},
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "override",
    [
        {"end_size": 0},
        {"round_size": 0},
        {"distance_m": 0},
        {"number": 0},
        {"end_size": 101},
        {"round_size": 101},
        {"distance_m": 101},
    ],
)
def test_a_round_with_an_impossible_shape_is_rejected(
    client: TestClient, override: dict
) -> None:
    game = _create_game(client)
    payload = {
        "number": 1,
        "recorded_at": RECORDED_AT,
        "end_size": 6,
        "round_size": 6,
        "distance_m": 70,
        "target_type": "122cm",
        **override,
    }
    res = client.post(f"/api/v1/games/{game['id']}/rounds", json=payload)
    assert res.status_code == 422


def test_ensuring_a_user_returns_the_row_a_concurrent_request_created(
    s: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    existing = user_crud.create_user(s, UserCreate(name="Yumi"), sub="racing-sub")
    lookup = user_crud.get_user_by_sub
    calls = {"count": 0}

    def losing_lookup(s: Session, sub: str):
        calls["count"] += 1
        return None if calls["count"] == 1 else lookup(s, sub)

    monkeypatch.setattr(user_crud, "get_user_by_sub", losing_lookup)

    user = user_crud.get_or_create_user(s, UserCreate(name="Yumi"), sub="racing-sub")
    assert user.id == existing.id
