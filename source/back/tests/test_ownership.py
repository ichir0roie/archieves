"""「本人のみ」のエンドポイントは他人の行を 403 で拒み、「本人以外も」のエンドポイントは通す。

だれを通すかの区分(.claude/docs/backend.md の「認証」)を、すべてのエンドポイントについて確かめる。
"""

from collections import defaultdict
from datetime import UTC, datetime

import pytest
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api import deps
from app.core.errors import ACCESS_TOKEN_NOT_ALLOWED
from app.main import app

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

    # 持ち主は要求で受けないので、送っても本人のまま
    assert response.status_code == 200
    assert response.json()["user_id"] == current_user.id


# 持ち主を user_id で受けていた一覧。今は本人をログインから引き、user_id は見ない
LISTS_ONCE_FILTERED_BY_USER_ID = [
    "/games",
    "/games/years",
    "/games/scores?year=2026",
    "/trash/games",
    "/trash/rounds",
    "/statistics/game-kinds",
    "/statistics/rounds",
    "/statistics/rounds/summary",
    "/statistics/ends",
    "/statistics/ends/summary",
    "/statistics/points/summary",
]


@pytest.mark.parametrize("path", LISTS_ONCE_FILTERED_BY_USER_ID)
def test_a_user_id_in_the_query_does_not_reach_another_users_rows(
    client: TestClient, others: dict, path: str
) -> None:
    owner = others["game"].user
    owner.profile_visibility = "public"
    separator = "&" if "?" in path else "?"

    mine = client.get(f"/api/v1{path}")
    with_user_id = client.get(f"/api/v1{path}{separator}user_id={owner.id}")

    assert mine.status_code == 200
    assert with_user_id.json() == mine.json()


def test_a_user_without_a_registered_row_is_not_found(
    unregistered_client: TestClient,
) -> None:
    response = unregistered_client.get("/api/v1/games")

    assert response.status_code == 404
    # 他人の行が無いときの "User not found" と分ける(フロントはこれで登録の画面へ送る)
    assert response.json()["detail"] == "Current user not registered"


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

    assert client.get(f"/api/v1/public/users/{other.id}/profile").status_code == 200
    assert client.get("/api/v1/public/ranking").status_code == 200
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
    assert client.put(f"/api/v1/admin/error-reports/{error_report.id}/resolve").status_code == 403
    assert client.get("/api/v1/admin/pending-counts").status_code == 403
    assert (
        client.put(f"/api/v1/admin/feedbacks/{feedback.id}/reply", json={"reply": "x"}).status_code
        == 403
    )


def test_announcements_can_be_read_by_anyone_signed_in(client: TestClient) -> None:
    assert client.get("/api/v1/announcements").status_code == 200


def test_deleting_my_account_leaves_another_users_rows(
    client: TestClient, s: Session, others: dict
) -> None:
    response = client.delete("/api/v1/users/me")

    assert response.status_code == 204
    s.expire_all()
    for row in others.values():
        assert s.get(type(row), row.id) is not None


def test_public_scores_can_be_read_without_signing_in(
    anonymous_client: TestClient, factories
) -> None:
    """/public は「本人のみ」「本人以外も」のどちらでもなく、ログインしていなくても通す。"""
    game = factories.GameFactory(user=factories.UserFactory(score_visibility="public"))

    response = anonymous_client.get("/api/v1/public/scores", params={"game_ids": [game.id]})

    assert response.status_code == 200


# 本人が発行したトークン(Claude Code など)でも読めるエンドポイント。本人の記録を読む GET だけ。
# ここに足すと、トークンで読める範囲が広がる
TOKEN_READABLE_ROUTES = {
    "/api/v1/users/me",
    "/api/v1/games",
    "/api/v1/games/years",
    "/api/v1/games/scores",
    "/api/v1/games/sheets",
    "/api/v1/games/{game_id}/sheet",
    "/api/v1/games/{game_id}",
    "/api/v1/trash/games",
    "/api/v1/games/{game_id}/rounds",
    "/api/v1/rounds/{round_id}",
    "/api/v1/trash/rounds",
    "/api/v1/rounds/{round_id}/ends",
    "/api/v1/ends/{end_id}",
    "/api/v1/ends/{end_id}/points",
    "/api/v1/points/{point_id}",
    "/api/v1/games/{game_id}/comments",
    "/api/v1/games/{game_id}/comment",
    "/api/v1/rounds/{round_id}/comment",
    "/api/v1/ends/{end_id}/comment",
    "/api/v1/export/records.db",
    "/api/v1/statistics/game-kinds",
    "/api/v1/statistics/rounds",
    "/api/v1/statistics/rounds/summary",
    "/api/v1/statistics/ends",
    "/api/v1/statistics/ends/summary",
    "/api/v1/statistics/points/summary",
    "/api/v1/diaries",
    "/api/v1/diaries/years",
}
# トークンで書ける口(AI コメント)。画面からのログインでは書けない
TOKEN_WRITABLE_ROUTES = {
    ("PUT", "/api/v1/games/{game_id}/ai-comment"),
    ("POST", "/api/v1/diaries/import"),
}
# トークンだけで繋ぐ口(MCP)。中で REST を呼び直し、どこまで通すかはそちらが決める
TOKEN_ONLY_ROUTES = {("POST", "/api/v1/mcp")}
UNAUTHENTICATED_ROUTES = {
    "/api/v1/health",
    "/api/v1/guide",
}


def _dependency_calls(dependant: Dependant) -> set[object]:
    calls: set[object] = set()
    for dependency in dependant.dependencies:
        calls.add(dependency.call)
        calls |= _dependency_calls(dependency)
    return calls


def _api_routes() -> list[tuple[str, APIRoute]]:
    return [
        (method, route)
        for route in app.routes
        if isinstance(route, APIRoute) and route.path.startswith("/api/v1/")
        for method in sorted(route.methods)
    ]


@pytest.mark.parametrize(
    ("method", "route"),
    _api_routes(),
    ids=[f"{method} {route.path}" for method, route in _api_routes()],
)
def test_every_endpoint_declares_who_it_lets_in(method: str, route: APIRoute) -> None:
    """エンドポイントごとに、だれを通すかの依存を付ける。付け忘れたものはトークンでも通ってしまう。"""
    calls = _dependency_calls(route.dependant)

    if route.path in UNAUTHENTICATED_ROUTES:
        assert not {deps.authenticate, deps.get_optional_me} & calls
    elif route.path.startswith("/api/v1/public/"):
        assert deps.get_optional_me in calls
        assert deps.authenticate not in calls
    elif (method, route.path) in TOKEN_ONLY_ROUTES:
        assert {deps.authenticate, deps.require_access_token} <= calls
        assert deps.get_browser_claims not in calls
    elif (method, route.path) in TOKEN_WRITABLE_ROUTES:
        assert deps.authenticate in calls
        assert calls & {deps.get_ai_commenter, deps.get_diary_importer}
        assert deps.get_browser_claims not in calls
    elif method == "GET" and route.path in TOKEN_READABLE_ROUTES:
        assert {deps.authenticate, deps.get_reader} <= calls
        assert deps.get_browser_claims not in calls
    else:
        assert {deps.authenticate, deps.get_browser_claims} <= calls
        assert deps.get_reader not in calls


def _filled(path: str, rows: dict) -> str:
    """パスの id を rows の行で埋める。ほかの id は 1 にする(403 は行を引く前に返る)。"""
    ids = defaultdict(
        lambda: 1,
        game_id=rows["game"].id,
        round_id=rows["round"].id,
        end_id=rows["end"].id,
        point_id=rows["point"].id,
        user_id=rows["game"].user_id,
    )
    return path.format_map(ids)


@pytest.fixture()
def mine(factories, current_user):
    """本人が持つ、game から point までと各コメントの一式。"""
    point = factories.PointFactory(end__round__game__user=current_user)
    end = point.end
    round_ = end.round
    game = round_.game
    factories.GameCommentFactory(game=game)
    factories.RoundCommentFactory(round=round_)
    factories.EndCommentFactory(end=end)
    return {"game": game, "round": round_, "end": end, "point": point}


@pytest.mark.parametrize("path", sorted(TOKEN_READABLE_ROUTES))
def test_a_token_reads_its_owners_records(token_client: TestClient, mine: dict, path: str) -> None:
    response = token_client.get(_filled(path, mine), params={"year": 2026})

    assert response.status_code == 200


@pytest.mark.parametrize(
    "path",
    sorted(path for path in TOKEN_READABLE_ROUTES if "{" in path),
)
def test_a_token_cannot_read_another_users_records(
    token_client: TestClient, others: dict, path: str
) -> None:
    response = token_client.get(_filled(path, others))

    assert response.status_code == 403


@pytest.mark.parametrize(
    ("method", "route"),
    [
        (method, route)
        for method, route in _api_routes()
        if route.path not in UNAUTHENTICATED_ROUTES
        and (method, route.path) not in TOKEN_WRITABLE_ROUTES | TOKEN_ONLY_ROUTES
        and not (method == "GET" and route.path in TOKEN_READABLE_ROUTES)
    ],
    ids=[
        f"{method} {route.path}"
        for method, route in _api_routes()
        if route.path not in UNAUTHENTICATED_ROUTES
        and (method, route.path) not in TOKEN_WRITABLE_ROUTES | TOKEN_ONLY_ROUTES
        and not (method == "GET" and route.path in TOKEN_READABLE_ROUTES)
    ],
)
def test_a_token_is_refused_everywhere_else(
    token_client: TestClient, mine: dict, method: str, route: APIRoute
) -> None:
    """書き込み・設定・管理・他人を見る画面(/public)は、トークンでは 403。"""
    response = token_client.request(
        method,
        _filled(route.path, mine),
        params={"game_ids": mine["game"].id},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": ACCESS_TOKEN_NOT_ALLOWED}
