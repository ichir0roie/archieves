"""要求の形の検証。db の列や SQL に届く前に 422 で弾く(届くと db の例外で 500 になる)。"""

import pytest
from fastapi.testclient import TestClient

from app.api.pagination import MAX_LIMIT
from app.core.names import MAX_NICKNAME_LENGTH, MAX_USER_NAME_LENGTH

LIST_PATHS = [
    "/games",
    "/trash/games",
    "/trash/rounds",
    "/organizations",
]


@pytest.mark.parametrize("path", LIST_PATHS)
@pytest.mark.parametrize(
    "query",
    [
        "skip=-1",
        "limit=0",
        f"limit={MAX_LIMIT + 1}",
    ],
)
def test_list_paging_out_of_range_is_rejected(client: TestClient, path: str, query: str) -> None:
    assert client.get(f"/api/v1{path}?{query}").status_code == 422


@pytest.mark.parametrize(
    "path",
    [
        "/games/{game}/rounds",
        "/rounds/{round}/ends",
        "/ends/{end}/points",
    ],
)
def test_child_list_paging_out_of_range_is_rejected(
    client: TestClient, current_user, factories, path: str
) -> None:
    point = factories.PointFactory(end__round__game__user=current_user)
    url = path.format(game=point.end.round.game.id, round=point.end.round.id, end=point.end.id)

    assert client.get(f"/api/v1{url}?skip=-1").status_code == 422
    assert client.get(f"/api/v1{url}?limit=0").status_code == 422


@pytest.mark.parametrize(
    "query",
    [
        "skip=-1",
        "limit=-1",
        f"limit={MAX_LIMIT + 1}",
    ],
)
def test_public_ranking_paging_out_of_range_is_rejected(
    anonymous_client: TestClient, query: str
) -> None:
    """ログインしなくても叩けるので、db の例外まで届かせない。"""
    assert anonymous_client.get(f"/api/v1/public/ranking?{query}").status_code == 422


def test_paging_at_the_limit_is_accepted(client: TestClient) -> None:
    assert client.get(f"/api/v1/games?skip=0&limit={MAX_LIMIT}").status_code == 200
    assert client.get(f"/api/v1/diaries?limit={MAX_LIMIT}").status_code == 200
    assert client.get(f"/api/v1/diaries?limit={MAX_LIMIT + 1}").status_code == 422
    assert client.get("/api/v1/organizations/search?q=a&limit=0").status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "x" * (MAX_USER_NAME_LENGTH + 1)},
        {"name": ""},
        {"name": None},
        {"nickname": "x" * (MAX_NICKNAME_LENGTH + 1)},
    ],
)
def test_my_name_out_of_range_is_rejected(client: TestClient, payload: dict) -> None:
    assert client.patch("/api/v1/users/me", json=payload).status_code == 422


def test_my_name_at_the_limit_is_accepted(client: TestClient) -> None:
    response = client.patch(
        "/api/v1/users/me",
        json={"name": "x" * MAX_USER_NAME_LENGTH, "nickname": None},
    )

    assert response.status_code == 200
    assert response.json()["nickname"] is None


def test_registering_with_a_too_long_name_is_rejected(unregistered_client: TestClient) -> None:
    response = unregistered_client.post(
        "/api/v1/users/me/ensure",
        json={"name": "x" * (MAX_USER_NAME_LENGTH + 1)},
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"name": ""},
        {"name": "x" * 101},
        {"name": "Club", "description": "x" * 501},
        {"name": "Club", "homepage_url": "javascript:alert(1)"},
        {"name": "Club", "homepage_url": "data:text/html,x"},
        {"name": "Club", "homepage_url": "example.com"},
    ],
)
def test_an_organization_out_of_range_or_with_a_non_http_url_is_rejected(
    client: TestClient, payload: dict
) -> None:
    assert client.post("/api/v1/organizations", json=payload).status_code == 422
    assert client.post("/api/v1/organizations/find-or-create", json=payload).status_code == 422


def test_an_organization_with_an_https_url_is_accepted(client: TestClient) -> None:
    response = client.post(
        "/api/v1/organizations",
        json={"name": "Validation Club", "homepage_url": "https://example.com/club"},
    )

    assert response.status_code == 201
    assert response.json()["homepage_url"] == "https://example.com/club"
