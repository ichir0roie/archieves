from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import User


def _create_user(client: TestClient) -> dict:
    res = client.post("/api/v1/users/me/ensure", json={"name": "Yumi"})
    assert res.status_code == 200
    return res.json()


def _create_game(client: TestClient, user_id: int, recorded_at: date) -> dict:
    res = client.post(
        "/api/v1/games", json={"recorded_at": recorded_at.isoformat(), "user_id": user_id}
    )
    assert res.status_code == 201
    return res.json()


def _build_round(
    client: TestClient, game_id: int, recorded_at: date, scores: list[int]
) -> None:
    round_res = client.post(
        f"/api/v1/games/{game_id}/rounds",
        json={
            "number": 1,
            "recorded_at": recorded_at.isoformat(),
            "end_size": len(scores),
            "distance_m": 30,
            "target_type": "122cm",
        },
    )
    assert round_res.status_code == 201
    end_res = client.post(
        f"/api/v1/rounds/{round_res.json()['id']}/ends",
        json={"number": 1, "recorded_at": recorded_at.isoformat()},
    )
    assert end_res.status_code == 201
    for i, score in enumerate(scores):
        point_res = client.post(
            f"/api/v1/ends/{end_res.json()['id']}/points",
            json={
                "number": i + 1,
                "score": score,
                "x": 0.0,
                "y": 0.0,
                "recorded_at": recorded_at.isoformat(),
            },
        )
        assert point_res.status_code == 201


def test_get_user_profile_returns_basic_info(client: TestClient) -> None:
    user = _create_user(client)

    res = client.get("/api/v1/users/test-user-sub/profile")
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["id"] == user["id"]
    assert body["user"]["name"] == "Yumi"
    assert body["matches"] == []
    assert body["rounds"]["count"] == 0


def test_get_missing_user_profile_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/users/test-user-sub/profile")
    assert response.status_code == 404


def test_get_other_users_profile_is_viewable(client: TestClient, db_session: Session) -> None:
    _create_user(client)
    other = User(sub="someone-elses-sub", name="Kenta")
    db_session.add(other)
    db_session.commit()

    response = client.get("/api/v1/users/someone-elses-sub/profile")
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["id"] == other.id
    assert body["user"]["name"] == "Kenta"
    assert body["user"]["sub"] == "someone-elses-sub"


def test_user_profile_only_counts_last_year_activity(client: TestClient) -> None:
    user = _create_user(client)
    now = date.today()

    recent_game = _create_game(client, user["id"], now - timedelta(days=10))
    _build_round(client, recent_game["id"], now - timedelta(days=10), scores=[9, 8, 7])

    old_game = _create_game(client, user["id"], now - timedelta(days=400))
    _build_round(client, old_game["id"], now - timedelta(days=400), scores=[10, 10, 10])

    res = client.get("/api/v1/users/test-user-sub/profile")
    assert res.status_code == 200
    body = res.json()
    assert body["rounds"]["count"] == 1
    assert body["rounds"]["total"] == 24
    assert body["points"]["count"] == 3


def test_user_profile_includes_recent_matches(client: TestClient) -> None:
    user = _create_user(client)
    now = date.today()

    recent_game = _create_game(client, user["id"], now - timedelta(days=5))
    match_res = client.post(
        f"/api/v1/games/{recent_game['id']}/match",
        json={"name": "全日本選手権", "link": "https://example.com/results"},
    )
    assert match_res.status_code == 201

    old_game = _create_game(client, user["id"], now - timedelta(days=400))
    client.post(f"/api/v1/games/{old_game['id']}/match", json={"name": "去年の大会"})

    res = client.get("/api/v1/users/test-user-sub/profile")
    assert res.status_code == 200
    body = res.json()
    assert [m["name"] for m in body["matches"]] == ["全日本選手権"]
    assert body["matches"][0]["game_id"] == recent_game["id"]
