from fastapi.testclient import TestClient


def test_create_and_get_user(client: TestClient) -> None:
    payload = {
        "name": "Yumi",
        "nickname": "Yu",
        "age": 25,
    }

    create_res = client.post("/api/v1/users", json=payload)
    assert create_res.status_code == 201
    user = create_res.json()
    assert user["name"] == "Yumi"
    assert user["nickname"] == "Yu"
    assert user["age"] == 25

    get_res = client.get(f"/api/v1/users/{user['id']}")
    assert get_res.status_code == 200
    assert get_res.json() == user


def test_list_users(client: TestClient) -> None:
    client.post("/api/v1/users", json={"name": "Yumi"})
    client.post("/api/v1/users", json={"name": "Kenta"})

    response = client.get("/api/v1/users")
    assert response.status_code == 200
    names = {user["name"] for user in response.json()}
    assert {"Yumi", "Kenta"} <= names


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


def test_create_user_with_negative_age_is_rejected(client: TestClient) -> None:
    payload = {"name": "Kenta", "age": -1}
    response = client.post("/api/v1/users", json=payload)
    assert response.status_code == 422


def test_get_missing_user_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/users/999")
    assert response.status_code == 404


def test_update_user_basic_info(client: TestClient) -> None:
    create_res = client.post("/api/v1/users", json={"name": "Yumi"})
    user_id = create_res.json()["id"]

    patch_res = client.patch(
        f"/api/v1/users/{user_id}",
        json={"nickname": "Yu-chan", "age": 30},
    )
    assert patch_res.status_code == 200
    body = patch_res.json()
    assert body["name"] == "Yumi"
    assert body["nickname"] == "Yu-chan"
    assert body["age"] == 30


def test_update_user_with_missing_organization_returns_404(client: TestClient) -> None:
    create_res = client.post("/api/v1/users", json={"name": "Yumi"})
    user_id = create_res.json()["id"]

    response = client.patch(f"/api/v1/users/{user_id}", json={"organization_id": 999})
    assert response.status_code == 404


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


def test_get_me_returns_404_when_not_registered(client: TestClient) -> None:
    response = client.get("/api/v1/users/me")
    assert response.status_code == 404


def test_get_me_returns_current_user_after_ensure(client: TestClient) -> None:
    create_res = client.post("/api/v1/users/me/ensure", json={"name": "Yumi"})
    created = create_res.json()

    response = client.get("/api/v1/users/me")
    assert response.status_code == 200
    assert response.json() == created
