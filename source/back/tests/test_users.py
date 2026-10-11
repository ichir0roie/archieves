from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crud import user as user_crud
from app.db import User
from app.schemas.user import UserCreate, calc_age


def test_create_and_get_user(client: TestClient, s: Session) -> None:
    payload = {
        "name": "Yumi",
        "nickname": "Yu",
        "birth_date": "2000-04-01",
    }

    create_res = client.post("/api/v1/users", json=payload)
    assert create_res.status_code == 201
    user = create_res.json()
    assert user["name"] == "Yumi"
    assert user["nickname"] == "Yu"
    assert user["birth_date"] == "2000-04-01"
    assert user["age"] == calc_age(date(2000, 4, 1), date.today())

    # 作った行は本人ではないので、プロフィールを公開してから読む
    created = s.get(User, user["id"])
    assert created is not None
    created.profile_visibility = "public"
    get_res = client.get(f"/api/v1/users/{user['id']}")
    assert get_res.status_code == 200
    assert get_res.json() == user


def test_list_users_shows_only_self_and_visible_profiles(
    client: TestClient, current_user, factories
) -> None:
    organization = factories.OrganizationFactory()
    current_user.organization_id = organization.id
    public = factories.UserFactory(profile_visibility="public")
    same_organization = factories.UserFactory(
        profile_visibility="organization", organization_id=organization.id
    )
    other_organization = factories.UserFactory(profile_visibility="organization")
    private = factories.UserFactory()

    response = client.get("/api/v1/users", params={"limit": 1000})
    assert response.status_code == 200
    ids = {user["id"] for user in response.json()}
    assert {current_user.id, public.id, same_organization.id} <= ids
    assert other_organization.id not in ids
    assert private.id not in ids


def test_create_user_with_organization(client: TestClient) -> None:
    org_res = client.post("/api/v1/organizations", json={"name": "Tokyo Archery Club"})
    organization_id = org_res.json()["id"]

    payload = {"name": "Kenta", "organization_id": organization_id}
    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 201
    assert response.json()["organization_id"] == organization_id


def test_create_user_with_missing_organization_returns_404(client: TestClient) -> None:
    payload = {"name": "Kenta", "organization_id": 999}
    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 404


def test_create_user_with_future_birth_date_is_rejected(client: TestClient) -> None:
    payload = {"name": "Kenta", "birth_date": (date.today() + timedelta(days=1)).isoformat()}
    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 422


def test_get_missing_user_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/users/999")
    assert response.status_code == 404


def test_update_user_basic_info(client: TestClient, current_user) -> None:
    user_id = current_user.id

    patch_res = client.patch(
        f"/api/v1/users/{user_id}",
        json={"nickname": "Yu-chan", "birth_date": "1995-12-31"},
    )
    assert patch_res.status_code == 200
    body = patch_res.json()
    assert body["name"] == "Yumi"
    assert body["nickname"] == "Yu-chan"
    assert body["birth_date"] == "1995-12-31"


def test_update_user_with_missing_organization_returns_404(
    client: TestClient, current_user
) -> None:
    user_id = current_user.id

    response = client.patch(f"/api/v1/users/{user_id}", json={"organization_id": 999})
    assert response.status_code == 404


def test_update_another_user_is_forbidden(client: TestClient, factories) -> None:
    other = factories.UserFactory(name="Kenta")

    response = client.patch(f"/api/v1/users/{other.id}", json={"nickname": "x"})
    assert response.status_code == 403


def test_get_another_user_with_a_public_profile_is_allowed(client: TestClient, factories) -> None:
    other = factories.UserFactory(name="Kenta", profile_visibility="public")

    response = client.get(f"/api/v1/users/{other.id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Kenta"


def test_get_another_user_with_a_private_profile_is_forbidden(
    client: TestClient, factories
) -> None:
    other = factories.UserFactory()

    assert client.get(f"/api/v1/users/{other.id}").status_code == 403


def test_visibility_defaults_to_private(client: TestClient) -> None:
    me = client.get("/api/v1/users/me").json()
    assert me["profile_visibility"] == "private"
    assert me["ranking_visibility"] == "private"


def test_update_visibility(client: TestClient) -> None:
    me = client.get("/api/v1/users/me").json()

    response = client.patch(
        f"/api/v1/users/{me['id']}",
        json={"profile_visibility": "organization", "ranking_visibility": "public"},
    )
    assert response.status_code == 200
    assert response.json()["profile_visibility"] == "organization"
    assert response.json()["ranking_visibility"] == "public"
    assert client.get("/api/v1/users/me").json()["ranking_visibility"] == "public"


@pytest.mark.parametrize(
    "payload",
    [
        {"profile_visibility": "friends"},
        {"ranking_visibility": None},
    ],
)
def test_update_rejects_an_unknown_or_null_visibility(client: TestClient, payload: dict) -> None:
    me = client.get("/api/v1/users/me").json()

    assert client.patch(f"/api/v1/users/{me['id']}", json=payload).status_code == 422


def test_update_missing_user_returns_404(client: TestClient) -> None:
    response = client.patch("/api/v1/users/999", json={"nickname": "x"})
    assert response.status_code == 404


def test_find_or_create_user_creates_then_reuses(client: TestClient) -> None:
    payload = {"name": "Yumi", "sub": "some-sub"}

    first = client.post("/api/v1/users/find-or-create", json=payload)
    assert first.status_code == 200
    created = first.json()

    second = client.post(
        "/api/v1/users/find-or-create",
        json={"name": "Someone Else", "sub": "some-sub"},
    )
    assert second.status_code == 200
    assert second.json() == created


def test_ensure_current_user_creates_then_reuses(client: TestClient) -> None:
    payload = {"name": "Yumi"}

    first = client.post("/api/v1/users/me/ensure", json=payload)
    assert first.status_code == 200
    created = first.json()

    second = client.post("/api/v1/users/me/ensure", json={"name": "Someone Else"})
    assert second.status_code == 200
    assert second.json() == created


def test_get_me_returns_404_when_not_registered(unregistered_client: TestClient) -> None:
    response = unregistered_client.get("/api/v1/users/me")
    assert response.status_code == 404


def test_get_me_returns_current_user_after_ensure(client: TestClient) -> None:
    create_res = client.post("/api/v1/users/me/ensure", json={"name": "Yumi"})
    created = create_res.json()

    response = client.get("/api/v1/users/me")
    assert response.status_code == 200
    assert response.json() == created


def test_ensuring_a_user_reraises_an_integrity_error_that_is_not_a_race(
    s: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_crud.create_user(s, UserCreate(name="Yumi"), sub="taken-sub")
    monkeypatch.setattr(user_crud, "get_user_by_sub", lambda s, sub: None)

    with pytest.raises(IntegrityError):
        user_crud.get_or_create_user(s, UserCreate(name="Yumi"), sub="taken-sub")


@pytest.mark.parametrize(
    ("today", "expected"),
    [
        (date(2026, 3, 31), 25),
        (date(2026, 4, 1), 26),
        (date(2026, 12, 31), 26),
    ],
)
def test_calc_age_counts_up_on_birthday(today: date, expected: int) -> None:
    assert calc_age(date(2000, 4, 1), today) == expected


def test_calc_age_for_leap_day_birth() -> None:
    assert calc_age(date(2004, 2, 29), date(2026, 2, 28)) == 21
    assert calc_age(date(2004, 2, 29), date(2026, 3, 1)) == 22


def test_is_admin_is_returned_only_for_myself(
    client: TestClient, s: Session, current_user, factories
) -> None:
    assert client.get("/api/v1/users/me").json()["is_admin"] is False

    current_user.is_admin = True
    s.flush()
    other = factories.UserFactory(is_admin=True)

    assert client.get("/api/v1/users/me").json()["is_admin"] is True
    assert "is_admin" not in client.get(f"/api/v1/users/{other.id}").json()
