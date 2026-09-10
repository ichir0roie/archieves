from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.scoring import MAX_RING_SCORE, MISS_SCORE, X_SCORE, scored_value
from app.crud import user as user_crud
from app.db import Point
from app.schemas.user import UserCreate

RECORDED_AT = "2026-01-01T00:00:00Z"


def _create_game(client: TestClient) -> dict:
    user_res = client.post("/api/v1/users", json={"name": "Yumi"})
    payload = {"recorded_at": RECORDED_AT, "user_id": user_res.json()["id"]}
    res = client.post("/api/v1/games", json=payload)
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


def test_an_x_is_worth_ten_in_the_ranking(client: TestClient) -> None:
    _end_of_scores(client, [X_SCORE] * 6)

    body = client.get("/api/v1/statistics/ranking").json()
    assert body[0]["average_score"] == 60.0


def test_a_legacy_negative_score_counts_as_a_miss(client: TestClient, db_session: Session) -> None:
    end = _end_of_scores(client, [9])
    # legacy_import writes rows straight through SQLAlchemy, so an
    # unresolved ring from an old backup can reach the DB as a negative score.
    db_session.add(
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
    db_session.commit()

    ends = client.get("/api/v1/statistics/ends").json()
    assert ends[0]["arrow_count"] == 2
    assert ends[0]["total_score"] == 9


def test_a_score_above_x_is_rejected(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])

    assert _post_point(client, end["id"], score=12).status_code == 422
    assert _post_point(client, end["id"], score=-1).status_code == 422


def test_an_x_on_a_ten_ring_compound_face_is_rejected(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"], target_type="compound")
    end = _create_end(client, round_["id"])

    assert _post_point(client, end["id"], score=X_SCORE).status_code == 422
    assert _post_point(client, end["id"], score=MAX_RING_SCORE).status_code == 201


def test_patching_a_point_to_a_score_the_face_cannot_produce_is_rejected(
    client: TestClient,
) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"], target_type="compound")
    end = _create_end(client, round_["id"])
    point = _post_point(client, end["id"], score=9).json()

    res = client.patch(f"/api/v1/points/{point['id']}", json={"score": X_SCORE})
    assert res.status_code == 422


def test_a_point_outside_the_target_area_is_rejected(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])

    res = client.post(
        f"/api/v1/ends/{end['id']}/points",
        json={"number": 1, "score": 9, "x": 1.5, "y": -2.5, "recorded_at": RECORDED_AT},
    )
    assert res.status_code == 422


def test_a_game_of_zero_rounds_is_rejected(client: TestClient) -> None:
    user_res = client.post("/api/v1/users", json={"name": "Yumi"})
    res = client.post(
        "/api/v1/games",
        json={"recorded_at": RECORDED_AT, "user_id": user_res.json()["id"], "game_size": 0},
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "override",
    [
        {"end_size": 0},
        {"round_size": 0},
        {"distance_m": 0},
        {"number": 0},
        {"end_size": 99},
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
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    existing = user_crud.create_user(db_session, UserCreate(name="Yumi"), sub="racing-sub")
    lookup = user_crud.get_user_by_sub
    calls = {"count": 0}

    def losing_lookup(db: Session, sub: str):
        calls["count"] += 1
        return None if calls["count"] == 1 else lookup(db, sub)

    monkeypatch.setattr(user_crud, "get_user_by_sub", losing_lookup)

    user = user_crud.get_or_create_user(db_session, UserCreate(name="Yumi"), sub="racing-sub")
    assert user.id == existing.id
