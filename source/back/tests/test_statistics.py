from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import Region

GAME_RECORDED_AT = "2026-01-01T00:00:00Z"


def _create_game(
    client: TestClient, *, user_id: int | None = None, recorded_at: str = GAME_RECORDED_AT
) -> dict:
    if user_id is None:
        user_res = client.post("/api/v1/users", json={"name": "Yumi"})
        user_id = user_res.json()["id"]
    payload = {"recorded_at": recorded_at, "user_id": user_id}
    res = client.post("/api/v1/games", json=payload)
    assert res.status_code == 201
    return res.json()


def _create_round(client: TestClient, game_id: int, *, recorded_at: str) -> dict:
    payload = {
        "number": 1,
        "recorded_at": recorded_at,
        "end_size": 6,
        "distance_m": 30,
        "target_type": "122cm",
    }
    res = client.post(f"/api/v1/games/{game_id}/rounds", json=payload)
    assert res.status_code == 201
    return res.json()


def _create_end(client: TestClient, round_id: int, *, recorded_at: str) -> dict:
    payload = {"number": 1, "recorded_at": recorded_at}
    res = client.post(f"/api/v1/rounds/{round_id}/ends", json=payload)
    assert res.status_code == 201
    return res.json()


def _create_point(client: TestClient, end_id: int, *, score: int, recorded_at: str) -> dict:
    payload = {"number": 1, "score": score, "x": 0.0, "y": 0.0, "recorded_at": recorded_at}
    res = client.post(f"/api/v1/ends/{end_id}/points", json=payload)
    assert res.status_code == 201
    return res.json()


def _build_round(client: TestClient, game_id: int, *, recorded_at: str, scores: list[int]) -> dict:
    round_ = _create_round(client, game_id, recorded_at=recorded_at)
    end = _create_end(client, round_["id"], recorded_at=recorded_at)
    for score in scores:
        _create_point(client, end["id"], score=score, recorded_at=recorded_at)
    return round_


def test_round_scores_are_aggregated(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _build_round(client, game["id"], recorded_at="2026-01-05T00:00:00Z", scores=[9, 7, 8])

    res = client.get("/api/v1/statistics/rounds")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["round_id"] == round_["id"]
    assert body[0]["arrow_count"] == 3
    assert body[0]["total_score"] == 24
    assert body[0]["average_score"] == 8.0


def test_round_score_summary_min_max_average_median(client: TestClient) -> None:
    game = _create_game(client)
    _build_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10, 10])  # 20
    _build_round(client, game["id"], recorded_at="2026-01-02T00:00:00Z", scores=[5, 5])  # 10
    _build_round(client, game["id"], recorded_at="2026-01-03T00:00:00Z", scores=[9, 9])  # 18

    res = client.get("/api/v1/statistics/rounds/summary")
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 3
    assert body["total"] == 48
    assert body["min"] == 10
    assert body["max"] == 20
    assert body["average"] == 16.0
    assert body["median"] == 18.0


def test_round_score_summary_filters_by_period(client: TestClient) -> None:
    game = _create_game(client)
    _build_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10])
    _build_round(client, game["id"], recorded_at="2026-02-01T00:00:00Z", scores=[2])

    res = client.get(
        "/api/v1/statistics/rounds/summary",
        params={"start": "2026-01-15T00:00:00Z"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 1
    assert body["total"] == 2


def test_round_score_summary_filters_by_user(client: TestClient) -> None:
    game_a = _create_game(client, user_id=None)
    _build_round(client, game_a["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10])

    res = client.get("/api/v1/statistics/rounds/summary", params={"user_id": 42})
    assert res.status_code == 200
    assert res.json()["count"] == 0


def test_end_score_summary(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z")
    end_a = _create_end(client, round_["id"], recorded_at="2026-01-01T00:00:00Z")
    end_b = _create_end(client, round_["id"], recorded_at="2026-01-02T00:00:00Z")
    _create_point(client, end_a["id"], score=9, recorded_at="2026-01-01T00:00:00Z")
    _create_point(client, end_a["id"], score=9, recorded_at="2026-01-01T00:00:00Z")
    _create_point(client, end_b["id"], score=5, recorded_at="2026-01-02T00:00:00Z")
    _create_point(client, end_b["id"], score=7, recorded_at="2026-01-02T00:00:00Z")

    list_res = client.get("/api/v1/statistics/ends")
    assert list_res.status_code == 200
    totals = sorted(row["total_score"] for row in list_res.json())
    assert totals == [12, 18]

    summary_res = client.get("/api/v1/statistics/ends/summary")
    assert summary_res.status_code == 200
    body = summary_res.json()
    assert body["count"] == 2
    assert body["min"] == 12
    assert body["max"] == 18
    assert body["average"] == 15.0
    assert body["median"] == 15.0


def test_point_score_summary(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z")
    end = _create_end(client, round_["id"], recorded_at="2026-01-01T00:00:00Z")
    for score in [10, 9, 5, 1]:
        _create_point(client, end["id"], score=score, recorded_at="2026-01-01T00:00:00Z")

    res = client.get("/api/v1/statistics/points/summary")
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 4
    assert body["total"] == 25
    assert body["min"] == 1
    assert body["max"] == 10
    assert body["average"] == 6.25
    assert body["median"] == 7.0


def _create_user(
    client: TestClient,
    *,
    name: str,
    organization_id: int | None = None,
    region_id: int | None = None,
) -> dict:
    payload = {
        "name": name,
        "organization_id": organization_id,
        "region_id": region_id,
    }
    res = client.post("/api/v1/users", json=payload)
    assert res.status_code == 201
    return res.json()


def _create_organization(client: TestClient, *, name: str) -> dict:
    res = client.post("/api/v1/organizations", json={"name": name})
    assert res.status_code == 201
    return res.json()


def test_ranking_orders_users_by_average_game_score_desc(client: TestClient) -> None:
    high = _create_user(client, name="high")
    low = _create_user(client, name="low")
    high_game = _create_game(client, user_id=high["id"])
    _build_round(client, high_game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10, 10])
    low_game = _create_game(client, user_id=low["id"])
    _build_round(client, low_game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[1, 1])

    res = client.get("/api/v1/statistics/ranking")
    assert res.status_code == 200
    body = res.json()
    assert [row["user"]["name"] for row in body] == ["high", "low"]
    assert [row["rank"] for row in body] == [1, 2]
    assert body[0]["average_score"] == 20.0
    assert body[0]["game_count"] == 1
    assert body[1]["average_score"] == 2.0


def test_ranking_averages_multiple_games_per_user(client: TestClient) -> None:
    user = _create_user(client, name="steady")
    game_a = _create_game(client, user_id=user["id"])
    _build_round(client, game_a["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10])
    game_b = _create_game(client, user_id=user["id"])
    _build_round(client, game_b["id"], recorded_at="2026-01-02T00:00:00Z", scores=[4])

    res = client.get("/api/v1/statistics/ranking")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["game_count"] == 2
    assert body[0]["average_score"] == 7.0


def test_ranking_filters_by_organization(client: TestClient) -> None:
    org_a = _create_organization(client, name="Club A")
    org_b = _create_organization(client, name="Club B")
    user_a = _create_user(client, name="member_a", organization_id=org_a["id"])
    user_b = _create_user(client, name="member_b", organization_id=org_b["id"])
    game_a = _create_game(client, user_id=user_a["id"])
    _build_round(client, game_a["id"], recorded_at="2026-01-01T00:00:00Z", scores=[9])
    game_b = _create_game(client, user_id=user_b["id"])
    _build_round(client, game_b["id"], recorded_at="2026-01-01T00:00:00Z", scores=[3])

    res = client.get("/api/v1/statistics/ranking", params={"organization_id": org_a["id"]})
    assert res.status_code == 200
    body = res.json()
    assert [row["user"]["name"] for row in body] == ["member_a"]


def test_ranking_filters_by_region(client: TestClient, db_session: Session) -> None:
    # No API creates Region rows yet, so insert them directly.
    region_tokyo = Region(name="Tokyo")
    region_osaka = Region(name="Osaka")
    db_session.add_all([region_tokyo, region_osaka])
    db_session.commit()

    tokyo = _create_user(client, name="tokyo_user", region_id=region_tokyo.id)
    osaka = _create_user(client, name="osaka_user", region_id=region_osaka.id)
    tokyo_game = _create_game(client, user_id=tokyo["id"])
    _build_round(client, tokyo_game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[9])
    osaka_game = _create_game(client, user_id=osaka["id"])
    _build_round(client, osaka_game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[3])

    res = client.get("/api/v1/statistics/ranking", params={"region_id": region_tokyo.id})
    assert res.status_code == 200
    body = res.json()
    assert [row["user"]["name"] for row in body] == ["tokyo_user"]


def test_ranking_filters_by_period(client: TestClient) -> None:
    user = _create_user(client, name="player")
    early_game = _create_game(client, user_id=user["id"], recorded_at="2026-01-01T00:00:00Z")
    late_game = _create_game(client, user_id=user["id"], recorded_at="2026-02-01T00:00:00Z")
    _build_round(client, early_game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10])
    _build_round(client, late_game["id"], recorded_at="2026-02-01T00:00:00Z", scores=[2])

    res = client.get(
        "/api/v1/statistics/ranking", params={"start": "2026-01-15T00:00:00Z"}
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["game_count"] == 1
    assert body[0]["average_score"] == 2.0


def test_ranking_excludes_users_without_games(client: TestClient) -> None:
    _create_user(client, name="no_games")

    res = client.get("/api/v1/statistics/ranking")
    assert res.status_code == 200
    assert res.json() == []


def test_summary_with_no_data_returns_empty_statistics(client: TestClient) -> None:
    res = client.get("/api/v1/statistics/rounds/summary")
    assert res.status_code == 200
    body = res.json()
    assert body == {
        "count": 0,
        "total": 0,
        "min": None,
        "max": None,
        "average": None,
        "median": None,
    }


def test_ranking_filters_by_period_end(client: TestClient) -> None:
    user = _create_user(client, name="player")
    early_game = _create_game(client, user_id=user["id"], recorded_at="2026-01-01T00:00:00Z")
    late_game = _create_game(client, user_id=user["id"], recorded_at="2026-02-01T00:00:00Z")
    _build_round(client, early_game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10])
    _build_round(client, late_game["id"], recorded_at="2026-02-01T00:00:00Z", scores=[2])

    res = client.get(
        "/api/v1/statistics/ranking", params={"end": "2026-01-15T00:00:00Z"}
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["game_count"] == 1
    assert body[0]["average_score"] == 10.0


def test_ranking_filters_by_both_period_bounds(client: TestClient) -> None:
    user = _create_user(client, name="player")
    for recorded_at, score in [
        ("2026-01-01T00:00:00Z", 10),
        ("2026-02-01T00:00:00Z", 8),
        ("2026-03-01T00:00:00Z", 6),
    ]:
        game = _create_game(client, user_id=user["id"], recorded_at=recorded_at)
        _build_round(client, game["id"], recorded_at=recorded_at, scores=[score])

    res = client.get(
        "/api/v1/statistics/ranking",
        params={"start": "2026-01-15T00:00:00Z", "end": "2026-02-15T00:00:00Z"},
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["game_count"] == 1
    assert body[0]["average_score"] == 8.0
