from fastapi.testclient import TestClient

RECORDED_AT = "2026-01-01T00:00:00Z"


def _create_user(client: TestClient, name: str = "Yumi") -> dict:
    res = client.get("/api/v1/users/me")
    assert res.status_code == 200
    return res.json()


def _create_game(client: TestClient, *, user_id: int | None = None) -> dict:
    if user_id is None:
        user_id = _create_user(client)["id"]
    payload = {"recorded_at": RECORDED_AT, "user_id": user_id}
    res = client.post("/api/v1/games", json=payload)
    assert res.status_code == 201
    return res.json()


def _create_match(client: TestClient, game_id: int, *, name: str = "全日本選手権") -> dict:
    payload = {"name": name, "link": "https://example.com/results"}
    res = client.post(f"/api/v1/games/{game_id}/match", json=payload)
    assert res.status_code == 201
    return res.json()


def test_create_and_get_match(client: TestClient) -> None:
    game = _create_game(client)
    match = _create_match(client, game["id"])

    assert match["game_id"] == game["id"]
    assert match["name"] == "全日本選手権"
    assert match["link"] == "https://example.com/results"

    get_res = client.get(f"/api/v1/games/{game['id']}/match")
    assert get_res.status_code == 200
    assert get_res.json() == match

    get_by_id_res = client.get(f"/api/v1/matches/{match['id']}")
    assert get_by_id_res.status_code == 200
    assert get_by_id_res.json() == match


def test_create_match_under_missing_game_returns_404(client: TestClient) -> None:
    response = client.post("/api/v1/games/999/match", json={"name": "Match"})
    assert response.status_code == 404


def test_create_second_match_for_same_game_conflicts(client: TestClient) -> None:
    game = _create_game(client)
    _create_match(client, game["id"])

    response = client.post(f"/api/v1/games/{game['id']}/match", json={"name": "別大会"})
    assert response.status_code == 409


def test_get_match_for_game_without_match_returns_404(client: TestClient) -> None:
    game = _create_game(client)
    response = client.get(f"/api/v1/games/{game['id']}/match")
    assert response.status_code == 404


def test_update_and_delete_match(client: TestClient) -> None:
    game = _create_game(client)
    match = _create_match(client, game["id"])

    patch_res = client.patch(f"/api/v1/matches/{match['id']}", json={"name": "更新後の大会名"})
    assert patch_res.status_code == 200
    assert patch_res.json()["name"] == "更新後の大会名"
    assert patch_res.json()["link"] == match["link"]

    delete_res = client.delete(f"/api/v1/matches/{match['id']}")
    assert delete_res.status_code == 204
    assert client.get(f"/api/v1/matches/{match['id']}").status_code == 404


def test_list_matches_filters_by_user_and_period(client: TestClient, factories) -> None:
    user_res = client.get("/api/v1/users/me")
    user_id = user_res.json()["id"]

    own_game = _create_game(client, user_id=user_id)
    own_match = _create_match(client, own_game["id"], name="自分の大会")

    other_match = factories.MatchFactory(name="他人の大会")

    response = client.get(f"/api/v1/matches?user_id={user_id}")
    assert response.status_code == 200
    body = response.json()
    assert [m["id"] for m in body] == [own_match["id"]]
    assert body[0]["recorded_at"] == "2026-01-01"

    out_of_range = client.get(
        f"/api/v1/matches?user_id={user_id}&start=2026-02-01T00:00:00Z"
    )
    assert out_of_range.status_code == 200
    assert out_of_range.json() == []

    assert [m["id"] for m in client.get("/api/v1/matches").json()] == [own_match["id"]]
    assert client.get(f"/api/v1/matches?user_id={other_match.user_id}").status_code == 403


def test_deleting_game_hides_its_match(client: TestClient) -> None:
    game = _create_game(client)
    match = _create_match(client, game["id"])

    assert client.delete(f"/api/v1/games/{game['id']}").status_code == 204

    assert client.get(f"/api/v1/matches/{match['id']}").status_code == 404
    assert client.get(f"/api/v1/games/{game['id']}/match").status_code == 404
