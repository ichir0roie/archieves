"""「本人のみ」のエンドポイントは他人の行を 403 で拒み、「本人以外も」のエンドポイントは通す。"""

import pytest
from fastapi.testclient import TestClient

RECORDED_AT = "2026-01-01"


@pytest.fixture()
def others(factories):
    """他人が持つ、game から point までと match・各コメントの一式。"""
    point = factories.PointFactory()
    end = point.end
    round_ = end.round
    game = round_.game
    match = factories.MatchFactory(game=game)
    factories.GameCommentFactory(game=game)
    factories.RoundCommentFactory(round=round_)
    factories.EndCommentFactory(end=end)
    return {"game": game, "round": round_, "end": end, "point": point, "match": match}


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/games/{game}"),
        ("patch", "/games/{game}"),
        ("delete", "/games/{game}"),
        ("post", "/games/{game}/restore"),
        ("get", "/games/{game}/match"),
        ("post", "/games/{game}/match"),
        ("get", "/games/{game}/rounds"),
        ("post", "/games/{game}/rounds"),
        ("get", "/games/{game}/comments"),
        ("get", "/games/{game}/comment"),
        ("put", "/games/{game}/comment"),
        ("delete", "/games/{game}/comment"),
        ("get", "/rounds/{round}"),
        ("patch", "/rounds/{round}"),
        ("delete", "/rounds/{round}"),
        ("post", "/rounds/{round}/restore"),
        ("get", "/rounds/{round}/ends"),
        ("post", "/rounds/{round}/ends"),
        ("get", "/rounds/{round}/comment"),
        ("put", "/rounds/{round}/comment"),
        ("delete", "/rounds/{round}/comment"),
        ("get", "/ends/{end}"),
        ("patch", "/ends/{end}"),
        ("delete", "/ends/{end}"),
        ("get", "/ends/{end}/points"),
        ("post", "/ends/{end}/points"),
        ("get", "/ends/{end}/comment"),
        ("put", "/ends/{end}/comment"),
        ("delete", "/ends/{end}/comment"),
        ("get", "/points/{point}"),
        ("patch", "/points/{point}"),
        ("delete", "/points/{point}"),
    ],
)
def test_another_users_rows_are_forbidden(
    client: TestClient, others: dict, method: str, path: str
) -> None:
    url = "/api/v1" + path.format(**{k: v.id for k, v in others.items()})

    # 形の検証(422)が先に走らないよう、どの書き込みにも通る要求の本体を付ける
    payload = {
        "body": "x",
        "number": 1,
        "score": 5,
        "x": 0.0,
        "y": 0.0,
        "name": "x",
        "end_size": 6,
        "distance_m": 70,
        "target_type": "122cm",
        "recorded_at": RECORDED_AT,
    }
    response = client.request(method, url, json=payload)

    assert response.status_code == 403


def test_matches_of_another_user_are_forbidden(client: TestClient, others: dict) -> None:
    match_id = others["match"].id

    assert client.get(f"/api/v1/matches/{match_id}").status_code == 403
    assert client.patch(f"/api/v1/matches/{match_id}", json={}).status_code == 403
    assert client.delete(f"/api/v1/matches/{match_id}").status_code == 403


def test_cannot_create_a_game_for_another_user(client: TestClient, others: dict) -> None:
    response = client.post(
        "/api/v1/games",
        json={"user_id": others["game"].user_id, "recorded_at": RECORDED_AT},
    )

    assert response.status_code == 403


def test_cannot_hand_my_game_to_another_user(
    client: TestClient, current_user, others: dict, factories
) -> None:
    game = factories.GameFactory(user=current_user)

    response = client.patch(f"/api/v1/games/{game.id}", json={"user_id": others["game"].user_id})

    assert response.status_code == 403


def test_trash_of_another_user_is_forbidden(client: TestClient, others: dict) -> None:
    user_id = others["game"].user_id

    assert client.get(f"/api/v1/trash/games?user_id={user_id}").status_code == 403
    assert client.get(f"/api/v1/trash/rounds?user_id={user_id}").status_code == 403
    assert client.get(f"/api/v1/matches?user_id={user_id}").status_code == 403
    assert client.get(f"/api/v1/games/years?user_id={user_id}").status_code == 403


def test_a_user_without_a_registered_row_is_not_found(
    unregistered_client: TestClient,
) -> None:
    assert unregistered_client.get("/api/v1/games").status_code == 404


def test_statistics_can_be_read_for_another_user(client: TestClient, others: dict) -> None:
    user_id = others["game"].user_id

    for path in [
        "/statistics/rounds",
        "/statistics/rounds/summary",
        "/statistics/ends",
        "/statistics/ends/summary",
        "/statistics/points/summary",
    ]:
        response = client.get(f"/api/v1{path}?user_id={user_id}")
        assert response.status_code == 200, path

    assert client.get("/api/v1/statistics/ranking").status_code == 200


def test_statistics_without_user_id_exclude_other_users(client: TestClient, others: dict) -> None:
    rounds = client.get("/api/v1/statistics/rounds")
    assert rounds.status_code == 200
    assert rounds.json() == []

    summary = client.get("/api/v1/statistics/points/summary")
    assert summary.status_code == 200
    assert summary.json()["count"] == 0


def test_user_profile_and_organizations_can_be_read_by_anyone_signed_in(
    client: TestClient, factories
) -> None:
    other = factories.UserFactory(sub="other-sub")
    organization = factories.OrganizationFactory()

    assert client.get(f"/api/v1/users/{other.id}").status_code == 200
    assert client.get("/api/v1/users/other-sub/profile").status_code == 200
    assert client.get("/api/v1/organizations").status_code == 200
    assert client.get(f"/api/v1/organizations/{organization.id}").status_code == 200
