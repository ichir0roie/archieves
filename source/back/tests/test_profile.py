from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.crud import profile as profile_crud
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

    res = client.get(f"/api/v1/users/{user['id']}/profile")
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["id"] == user["id"]
    assert body["user"]["name"] == "Yumi"
    assert body["rounds"]["count"] == 0


def test_get_missing_user_profile_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/users/999999/profile")
    assert response.status_code == 404
    assert response.json() == {"detail": "User not found"}


def test_get_other_users_profile_is_viewable(client: TestClient, s: Session) -> None:
    _create_user(client)
    other = User(sub="someone-elses-sub", name="Kenta", profile_visibility="public")
    s.add(other)
    s.commit()

    response = client.get(f"/api/v1/users/{other.id}/profile")
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

    res = client.get(f"/api/v1/users/{user['id']}/profile")
    assert res.status_code == 200
    body = res.json()
    assert body["rounds"]["count"] == 1
    assert body["rounds"]["total"] == 24
    assert body["points"]["count"] == 3


def test_profile_of_a_user_id_that_does_not_exist_is_none(s: Session) -> None:
    assert profile_crud.get_user_profile(s, 999) is None


@pytest.mark.parametrize(
    ("visibility", "same_organization", "status"),
    [
        ("private", True, 403),
        ("organization", True, 200),
        ("organization", False, 403),
        ("public", False, 200),
    ],
)
def test_other_users_profile_follows_its_visibility(
    client: TestClient,
    current_user,
    factories,
    visibility: str,
    same_organization: bool,
    status: int,
) -> None:
    organization = factories.OrganizationFactory()
    current_user.organization_id = organization.id
    other_organization = organization if same_organization else factories.OrganizationFactory()
    other = factories.UserFactory(
        sub="other-sub",
        profile_visibility=visibility,
        organization_id=other_organization.id,
    )

    assert client.get(f"/api/v1/users/{other.id}/profile").status_code == status


def test_organization_visibility_needs_an_organization_on_both_sides(
    client: TestClient, factories
) -> None:
    # 組織に入っていない利用者どうしは、組織公開でも見えない
    other = factories.UserFactory(sub="other-sub", profile_visibility="organization")

    assert client.get(f"/api/v1/users/{other.id}/profile").status_code == 403


def test_own_private_profile_is_viewable(client: TestClient, current_user) -> None:
    assert current_user.profile_visibility == "private"

    assert client.get(f"/api/v1/users/{current_user.id}/profile").status_code == 200
