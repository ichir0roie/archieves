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


def test_admin_lists_organizations_with_their_user_counts(
    client: TestClient, current_user, factories
) -> None:
    current_user.is_admin = True
    club = factories.OrganizationFactory(name="一覧の部")
    empty = factories.OrganizationFactory(name="空の部")
    factories.UserFactory.create_batch(2, organization=club)

    response = client.get("/api/v1/admin/organizations")
    assert response.status_code == 200
    counts = {org["id"]: org["user_count"] for org in response.json()}
    assert counts[club.id] == 2
    assert counts[empty.id] == 0


def test_admin_updates_an_organization(client: TestClient, current_user, factories) -> None:
    current_user.is_admin = True
    parent = factories.OrganizationFactory(name="全日本アーチェリー連盟")
    club = factories.OrganizationFactory(name="直す前の部", location="大阪")
    factories.UserFactory(organization=club)

    response = client.patch(
        f"/api/v1/admin/organizations/{club.id}",
        json={
            "name": "直した部",
            "homepage_url": "https://example.com/club",
            "parent_organization_id": parent.id,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "直した部"
    assert body["homepage_url"] == "https://example.com/club"
    # 送らなかった欄は残る
    assert body["location"] == "大阪"
    assert body["parent_organization"] == {"id": parent.id, "name": parent.name}
    assert body["user_count"] == 1
    assert client.get(f"/api/v1/organizations/{club.id}").json()["name"] == "直した部"


def test_admin_clears_fields_with_null(client: TestClient, current_user, factories) -> None:
    current_user.is_admin = True
    parent = factories.OrganizationFactory(name="上の会")
    club = factories.OrganizationFactory(
        name="消す部",
        location="京都",
        homepage_url="https://example.com",
        parent_organization=parent,
    )

    response = client.patch(
        f"/api/v1/admin/organizations/{club.id}",
        json={"location": None, "homepage_url": None, "parent_organization_id": None},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["location"] is None
    assert body["homepage_url"] is None
    assert body["parent_organization"] is None
    assert body["name"] == "消す部"


def test_admin_update_keeps_its_own_name(client: TestClient, current_user, factories) -> None:
    current_user.is_admin = True
    club = factories.OrganizationFactory(name="同じ名前の部")

    response = client.patch(
        f"/api/v1/admin/organizations/{club.id}",
        json={"name": "同じ名前の部", "location": "神戸"},
    )
    assert response.status_code == 200
    assert response.json()["location"] == "神戸"


def test_admin_update_rejects_a_taken_name(client: TestClient, current_user, factories) -> None:
    current_user.is_admin = True
    factories.OrganizationFactory(name="先にある部")
    club = factories.OrganizationFactory(name="後の部")

    response = client.patch(
        f"/api/v1/admin/organizations/{club.id}", json={"name": "先にある部"}
    )
    assert response.status_code == 409


def test_admin_update_rejects_bad_values(client: TestClient, current_user, factories) -> None:
    current_user.is_admin = True
    club = factories.OrganizationFactory(name="弾く部")
    path = f"/api/v1/admin/organizations/{club.id}"

    assert client.patch(path, json={"name": None}).status_code == 422
    assert client.patch(path, json={"name": ""}).status_code == 422
    assert client.patch(path, json={"name": "x" * 1000}).status_code == 422
    assert client.patch(path, json={"homepage_url": "javascript:alert(1)"}).status_code == 422
    assert client.get(f"/api/v1/organizations/{club.id}").json()["name"] == "弾く部"


def test_admin_update_rejects_a_parent_that_makes_a_loop(
    client: TestClient, current_user, factories
) -> None:
    current_user.is_admin = True
    top = factories.OrganizationFactory(name="上")
    middle = factories.OrganizationFactory(name="中", parent_organization=top)
    bottom = factories.OrganizationFactory(name="下", parent_organization=middle)
    path = f"/api/v1/admin/organizations/{top.id}"

    assert client.patch(path, json={"parent_organization_id": top.id}).status_code == 422
    assert client.patch(path, json={"parent_organization_id": bottom.id}).status_code == 422
    assert client.get(f"/api/v1/organizations/{top.id}").json()["parent_organization"] is None


def test_admin_update_of_missing_rows_is_not_found(
    client: TestClient, current_user, factories
) -> None:
    current_user.is_admin = True
    club = factories.OrganizationFactory(name="ある部")

    assert (
        client.patch("/api/v1/admin/organizations/999999999", json={"name": "x"}).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/admin/organizations/{club.id}",
            json={"parent_organization_id": 999999999},
        ).status_code
        == 404
    )


def test_admin_organizations_are_forbidden_for_non_admins(
    client: TestClient, factories
) -> None:
    club = factories.OrganizationFactory(name="触れない部")

    assert client.get("/api/v1/admin/organizations").status_code == 403
    response = client.patch(f"/api/v1/admin/organizations/{club.id}", json={"name": "x"})
    assert response.status_code == 403
    assert client.get(f"/api/v1/organizations/{club.id}").json()["name"] == "触れない部"
