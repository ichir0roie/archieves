"""本人が発行する、記録を読むだけのトークン(Claude Code などに渡す)。

どのエンドポイントをトークンで読めるかは tests/test_ownership.py が確かめる。
"""

from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api import deps
from app.core.access_token import MAX_TOKENS_PER_USER, TOKEN_PREFIX, hash_token
from app.core.errors import ForbiddenError
from app.core.security import ACCESS_TOKEN_HEADER
from app.crud import access_token as access_token_crud
from app.db import AccessToken
from app.main import app


def test_issue_a_token_and_show_it_only_once(client: TestClient, s: Session, current_user) -> None:
    response = client.post(
        "/api/v1/access-tokens",
        json={
            "name": "Claude Code",
            "expires_in_days": 30,
        },
    )

    assert response.status_code == 201
    created = response.json()
    token = created["token"]
    assert token.startswith(TOKEN_PREFIX)
    assert created["name"] == "Claude Code"
    assert created["token_prefix"] == token[: len(created["token_prefix"])]
    expires_at = datetime.fromisoformat(created["expires_at"])
    assert timedelta(days=29) < expires_at - datetime.now(UTC) <= timedelta(days=30)

    # db には平文を置かず、ハッシュだけを置く
    row = s.scalar(select(AccessToken).where(AccessToken.id == created["id"]))
    assert row is not None
    assert row.user_id == current_user.id
    assert row.token_hash == hash_token(token)
    assert token not in (row.token_hash, row.token_prefix)

    # 一覧には平文を載せない
    listed = client.get("/api/v1/access-tokens").json()
    assert [t["id"] for t in listed] == [created["id"]]
    assert "token" not in listed[0]


def test_issued_token_defaults_to_90_days(client: TestClient) -> None:
    created = client.post("/api/v1/access-tokens", json={"name": "Claude Code"}).json()

    expires_at = datetime.fromisoformat(created["expires_at"])
    assert timedelta(days=89) < expires_at - datetime.now(UTC) <= timedelta(days=90)


@pytest.mark.parametrize(
    "payload",
    [
        {"name": ""},
        {"name": "x" * 51},
        {"name": "Claude Code", "expires_in_days": 0},
        {"name": "Claude Code", "expires_in_days": 366},
    ],
)
def test_issuing_rejects_a_bad_name_or_term(client: TestClient, payload: dict) -> None:
    assert client.post("/api/v1/access-tokens", json=payload).status_code == 422


def test_issuing_is_limited_per_user(client: TestClient, s: Session, current_user) -> None:
    for _ in range(MAX_TOKENS_PER_USER):
        access_token_crud.create_access_token(s, current_user.id, "Claude Code", 30)

    response = client.post("/api/v1/access-tokens", json={"name": "Claude Code"})

    assert response.status_code == 409


def test_tokens_of_another_user_are_not_listed(
    client: TestClient, s: Session, current_user, factories
) -> None:
    others, _ = access_token_crud.create_access_token(s, factories.UserFactory().id, "x", 30)
    mine, _ = access_token_crud.create_access_token(s, current_user.id, "Claude Code", 30)

    listed = client.get("/api/v1/access-tokens").json()

    assert [t["id"] for t in listed] == [mine.id]
    assert others.id not in [t["id"] for t in listed]


def test_revoking_a_token_stops_it(
    client: TestClient, s: Session, current_user, access_token: str
) -> None:
    row = s.scalar(select(AccessToken).where(AccessToken.token_hash == hash_token(access_token)))
    assert row is not None
    headers = {ACCESS_TOKEN_HEADER: access_token}

    assert client.delete(f"/api/v1/access-tokens/{row.id}").status_code == 204

    assert client.get("/api/v1/access-tokens").json() == []
    app.dependency_overrides[deps.get_optional_current_user] = lambda: None
    assert client.get("/api/v1/games", headers=headers).status_code == 401


def test_revoking_another_users_token_is_forbidden(
    client: TestClient, s: Session, factories
) -> None:
    others, _ = access_token_crud.create_access_token(s, factories.UserFactory().id, "x", 30)

    assert client.delete(f"/api/v1/access-tokens/{others.id}").status_code == 403


def test_revoking_a_missing_token_returns_404(client: TestClient) -> None:
    assert client.delete("/api/v1/access-tokens/999999999").status_code == 404


def test_a_user_without_a_registered_row_cannot_issue_tokens(
    unregistered_client: TestClient,
) -> None:
    response = unregistered_client.post("/api/v1/access-tokens", json={"name": "Claude Code"})

    assert response.status_code == 404
    assert response.json()["detail"] == "Current user not registered"


def test_an_expired_token_is_refused(
    token_client: TestClient, s: Session, access_token: str
) -> None:
    row = s.scalar(select(AccessToken).where(AccessToken.token_hash == hash_token(access_token)))
    assert row is not None
    row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    s.commit()

    response = token_client.get("/api/v1/games")

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid access token"}


def test_an_unknown_token_is_refused(token_client: TestClient) -> None:
    response = token_client.get(
        "/api/v1/games",
        headers={ACCESS_TOKEN_HEADER: f"{TOKEN_PREFIX}not-issued"},
    )

    assert response.status_code == 401


def test_a_token_reads_as_its_owner(
    token_client: TestClient, current_user, factories
) -> None:
    mine = factories.GameFactory(user=current_user)
    factories.GameFactory()

    me = token_client.get("/api/v1/users/me")
    games = token_client.get("/api/v1/games")

    assert me.json()["id"] == current_user.id
    assert [g["id"] for g in games.json()] == [mine.id]


@pytest.fixture()
def raw_client(s: Session) -> Generator[TestClient]:
    """ログインを差し替えない client。AUTH_MODE=cognito のまま、ヘッダーだけで確かめる。"""

    def _get_session_override() -> Generator[Session]:
        yield s

    app.dependency_overrides[deps.get_session] = _get_session_override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_a_token_alone_is_enough_without_a_cognito_sign_in(
    raw_client: TestClient, access_token: str
) -> None:
    headers = {ACCESS_TOKEN_HEADER: access_token}

    assert raw_client.get("/api/v1/games", headers=headers).status_code == 200
    assert raw_client.post(
        "/api/v1/games",
        headers=headers,
        json={"recorded_at": "2026-01-01"},
    ).status_code == 403


def test_without_a_sign_in_or_a_token_is_unauthenticated(raw_client: TestClient) -> None:
    response = raw_client.get("/api/v1/games")

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def _request(method: str) -> Request:
    return Request({"type": "http", "method": method, "headers": []})


def test_a_reader_refuses_a_token_on_a_write(s: Session, current_user) -> None:
    # get_reader を GET 以外に付け間違えても、トークンでは書かせない
    with pytest.raises(ForbiddenError):
        deps.get_reader(_request("POST"), token_user=current_user, claims=None, s=s)


def test_signed_in_dependencies_require_a_sign_in(s: Session) -> None:
    # ふだんは authenticated_router の入り口(deps.authenticate)が先に 401 にする
    with pytest.raises(HTTPException) as browser:
        deps.get_browser_claims(token=None, claims=None)
    with pytest.raises(HTTPException) as reader:
        deps.get_reader(_request("GET"), token_user=None, claims=None, s=s)

    assert browser.value.status_code == 401
    assert reader.value.status_code == 401


def test_the_agent_guide_is_readable_with_only_a_token(
    raw_client: TestClient, access_token: str
) -> None:
    response = raw_client.get("/api/v1/guide", headers={ACCESS_TOKEN_HEADER: access_token})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")
    assert "/games/{game_id}/ai-comment" in response.text
    assert "/games/sheets" in response.text
