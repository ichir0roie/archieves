"""「本人のみ」のエンドポイントは他人の行を 403 で拒み、「本人以外も」のエンドポイントは通す。"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

RECORDED_AT = "2026-01-01"


@pytest.fixture()
def others(factories):
    """他人が持つ、game から point までと各コメントの一式。"""
    point = factories.PointFactory()
    end = point.end
    round_ = end.round
    game = round_.game
    factories.GameCommentFactory(game=game)
    factories.RoundCommentFactory(round=round_)
    factories.EndCommentFactory(end=end)
    return {"game": game, "round": round_, "end": end, "point": point}


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/games/{game}"),
        ("patch", "/games/{game}"),
        ("delete", "/games/{game}"),
        ("post", "/games/{game}/restore"),
        ("get", "/games/{game}/rounds"),
        ("post", "/games/{game}/rounds"),
        ("get", "/games/{game}/sheet"),
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


def test_cannot_create_a_game_for_another_user(client: TestClient, others: dict) -> None:
    response = client.post(
        "/api/v1/games",
        json={"user_id": others["game"].user_id, "recorded_at": RECORDED_AT},
    )

    assert response.status_code == 403


def test_cannot_save_a_sheet_into_another_users_game(client: TestClient, others: dict) -> None:
    response = client.put(
        "/api/v1/games/sheet",
        json={"id": others["game"].id, "recorded_at": RECORDED_AT},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Not allowed to access another user's data"}


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
    assert client.get(f"/api/v1/games/years?user_id={user_id}").status_code == 403
    assert client.get(f"/api/v1/games/scores?year=2026&user_id={user_id}").status_code == 403


def test_a_user_without_a_registered_row_is_not_found(
    unregistered_client: TestClient,
) -> None:
    response = unregistered_client.get("/api/v1/games")

    assert response.status_code == 404
    # 他人の行が無いときの "User not found" と分ける(フロントはこれで登録の画面へ送る)
    assert response.json()["detail"] == "Current user not registered"


OTHER_USER_STATISTICS_PATHS = [
    "/statistics/game-kinds",
    "/statistics/rounds",
    "/statistics/rounds/summary",
    "/statistics/ends",
    "/statistics/ends/summary",
    "/statistics/points/summary",
]


def test_statistics_can_be_read_for_another_user_with_a_public_profile(
    client: TestClient, others: dict
) -> None:
    owner = others["game"].user
    owner.profile_visibility = "public"

    for path in OTHER_USER_STATISTICS_PATHS:
        response = client.get(f"/api/v1{path}?user_id={owner.id}")
        assert response.status_code == 200, path

    assert client.get("/api/v1/statistics/ranking").status_code == 200


def test_statistics_of_another_user_with_a_private_profile_are_forbidden(
    client: TestClient, others: dict
) -> None:
    user_id = others["game"].user_id

    for path in OTHER_USER_STATISTICS_PATHS:
        response = client.get(f"/api/v1{path}?user_id={user_id}")
        assert response.status_code == 403, path


def test_statistics_of_a_missing_user_are_not_found(client: TestClient) -> None:
    assert client.get("/api/v1/statistics/rounds?user_id=999999999").status_code == 404


def test_statistics_without_user_id_exclude_other_users(client: TestClient, others: dict) -> None:
    rounds = client.get("/api/v1/statistics/rounds")
    assert rounds.status_code == 200
    assert rounds.json() == []

    summary = client.get("/api/v1/statistics/points/summary")
    assert summary.status_code == 200
    assert summary.json()["count"] == 0


def test_public_profiles_and_organizations_can_be_read_by_anyone_signed_in(
    client: TestClient, factories
) -> None:
    other = factories.UserFactory(sub="other-sub", profile_visibility="public")
    organization = factories.OrganizationFactory()

    assert client.get(f"/api/v1/users/{other.id}").status_code == 200
    assert client.get("/api/v1/users/other-sub/profile").status_code == 200
    assert client.get("/api/v1/organizations").status_code == 200
    assert client.get(f"/api/v1/organizations/{organization.id}").status_code == 200


def test_feedbacks_of_another_user_are_not_listed(
    client: TestClient, current_user, factories
) -> None:
    factories.FeedbackFactory()
    mine = factories.FeedbackFactory(user=current_user)

    response = client.get("/api/v1/feedbacks")

    assert response.status_code == 200
    assert [f["id"] for f in response.json()] == [mine.id]


def test_diaries_of_another_user_are_not_listed(
    client: TestClient, current_user, factories
) -> None:
    factories.DiaryFactory(created_at=datetime(2020, 6, 1, tzinfo=UTC))
    mine = factories.DiaryFactory(user=current_user, created_at=datetime(2026, 6, 1, tzinfo=UTC))

    response = client.get("/api/v1/diaries")

    assert response.status_code == 200
    assert [d["id"] for d in response.json()] == [mine.id]
    assert client.get("/api/v1/diaries/years").json() == [2026]


def test_admin_endpoints_are_forbidden_for_non_admins(client: TestClient, factories) -> None:
    feedback = factories.FeedbackFactory()
    error_report = factories.ErrorReportFactory()

    assert client.get("/api/v1/admin/feedbacks").status_code == 403
    assert client.get("/api/v1/admin/error-reports").status_code == 403
    assert (
        client.put(f"/api/v1/admin/error-reports/{error_report.id}/resolve").status_code == 403
    )
    assert client.get("/api/v1/admin/pending-counts").status_code == 403
    assert (
        client.put(
            f"/api/v1/admin/feedbacks/{feedback.id}/reply", json={"reply": "x"}
        ).status_code
        == 403
    )


def test_announcements_can_be_read_by_anyone_signed_in(client: TestClient) -> None:
    assert client.get("/api/v1/announcements").status_code == 200
