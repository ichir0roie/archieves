from fastapi.testclient import TestClient


def test_create_and_get_organization(client: TestClient) -> None:
    payload = {"name": "Tokyo Archery Club", "description": "A local club"}

    create_res = client.post("/api/v1/organizations", json=payload)
    assert create_res.status_code == 201
    organization = create_res.json()
    assert organization["name"] == "Tokyo Archery Club"

    get_res = client.get(f"/api/v1/organizations/{organization['id']}")
    assert get_res.status_code == 200
    assert get_res.json() == organization


def test_create_organization_duplicate_name_conflicts(client: TestClient) -> None:
    payload = {"name": "Tokyo Archery Club"}
    client.post("/api/v1/organizations", json=payload)

    response = client.post("/api/v1/organizations", json=payload)
    assert response.status_code == 409


def test_get_missing_organization_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/organizations/999")
    assert response.status_code == 404


def test_list_organizations(client: TestClient) -> None:
    client.post("/api/v1/organizations", json={"name": "Club A"})
    client.post("/api/v1/organizations", json={"name": "Club B"})

    response = client.get("/api/v1/organizations")
    assert response.status_code == 200
    names = {org["name"] for org in response.json()}
    assert {"Club A", "Club B"} <= names


def test_create_organization_with_detail_fields(client: TestClient) -> None:
    payload = {
        "name": "Tokyo Archery Club",
        "formal_name": "特定非営利活動法人東京アーチェリークラブ",
        "homepage_url": "https://example.com",
        "location": "Tokyo, Japan",
    }

    create_res = client.post("/api/v1/organizations", json=payload)
    assert create_res.status_code == 201
    organization = create_res.json()
    assert organization["formal_name"] == payload["formal_name"]
    assert organization["homepage_url"] == payload["homepage_url"]
    assert organization["location"] == payload["location"]
    assert organization["parent_organization"] is None


def test_create_organization_with_parent_organization(client: TestClient) -> None:
    parent_res = client.post("/api/v1/organizations", json={"name": "Japan Archery Federation"})
    parent = parent_res.json()

    child_res = client.post(
        "/api/v1/organizations",
        json={"name": "Tokyo Archery Club", "parent_organization_id": parent["id"]},
    )
    assert child_res.status_code == 201
    child = child_res.json()
    assert child["parent_organization_id"] == parent["id"]
    assert child["parent_organization"] == {"id": parent["id"], "name": parent["name"]}


def test_create_organization_with_missing_parent_returns_404(client: TestClient) -> None:
    response = client.post(
        "/api/v1/organizations",
        json={"name": "Tokyo Archery Club", "parent_organization_id": 999},
    )
    assert response.status_code == 404


def test_search_organizations_by_prefix(client: TestClient) -> None:
    client.post("/api/v1/organizations", json={"name": "Tokyo Archery Club"})
    client.post("/api/v1/organizations", json={"name": "Tokyo Bowmen"})
    client.post("/api/v1/organizations", json={"name": "Osaka Archery Club"})

    response = client.get("/api/v1/organizations/search", params={"q": "Tokyo"})
    assert response.status_code == 200
    names = {org["name"] for org in response.json()}
    assert names == {"Tokyo Archery Club", "Tokyo Bowmen"}


def test_search_organizations_is_case_insensitive(client: TestClient) -> None:
    client.post("/api/v1/organizations", json={"name": "Tokyo Archery Club"})

    response = client.get("/api/v1/organizations/search", params={"q": "tokyo"})
    assert response.status_code == 200
    names = {org["name"] for org in response.json()}
    assert names == {"Tokyo Archery Club"}


def test_search_organizations_does_not_match_substring_outside_prefix(
    client: TestClient,
) -> None:
    client.post("/api/v1/organizations", json={"name": "Tokyo Archery Club"})

    response = client.get("/api/v1/organizations/search", params={"q": "Archery"})
    assert response.status_code == 200
    assert response.json() == []


def test_find_or_create_organization_creates_then_reuses(client: TestClient) -> None:
    payload = {"name": "Tokyo Archery Club"}

    first = client.post("/api/v1/organizations/find-or-create", json=payload)
    assert first.status_code == 200
    created = first.json()

    second = client.post("/api/v1/organizations/find-or-create", json=payload)
    assert second.status_code == 200
    assert second.json() == created
