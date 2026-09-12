from fastapi.testclient import TestClient

RECORDED_AT = "2026-01-01"


def _create_user(client: TestClient, name: str = "Yumi") -> dict:
    res = client.post("/api/v1/users", json={"name": name})
    assert res.status_code == 201
    return res.json()


def _create_game(client: TestClient) -> dict:
    user = _create_user(client)
    res = client.post(
        "/api/v1/games", json={"user_id": user["id"], "recorded_at": RECORDED_AT}
    )
    assert res.status_code == 201
    return res.json()


def _create_round(client: TestClient, game_id: int, number: int = 1) -> dict:
    payload = {
        "number": number,
        "recorded_at": RECORDED_AT,
        "end_size": 6,
        "distance_m": 70,
        "target_type": "122cm",
    }
    res = client.post(f"/api/v1/games/{game_id}/rounds", json=payload)
    assert res.status_code == 201
    return res.json()


def _create_end(client: TestClient, round_id: int, number: int = 1) -> dict:
    res = client.post(
        f"/api/v1/rounds/{round_id}/ends",
        json={"number": number, "recorded_at": RECORDED_AT},
    )
    assert res.status_code == 201
    return res.json()


def _create_game_tree(client: TestClient) -> tuple[dict, dict, dict]:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])
    return game, round_, end


def test_save_and_get_game_comment(client: TestClient) -> None:
    game = _create_game(client)

    res = client.put(f"/api/v1/games/{game['id']}/comment", json={"body": "調子が良かった"})
    assert res.status_code == 200
    comment = res.json()
    assert comment["game_id"] == game["id"]
    assert comment["user_id"] == game["user_id"]
    assert comment["body"] == "調子が良かった"

    get_res = client.get(f"/api/v1/games/{game['id']}/comment")
    assert get_res.status_code == 200
    assert get_res.json() == comment


def test_saving_twice_updates_the_same_comment(client: TestClient) -> None:
    game = _create_game(client)

    first = client.put(f"/api/v1/games/{game['id']}/comment", json={"body": "最初"}).json()
    second = client.put(f"/api/v1/games/{game['id']}/comment", json={"body": "訂正"}).json()

    assert second["id"] == first["id"]
    assert second["body"] == "訂正"


def test_save_and_get_round_comment(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])

    res = client.put(f"/api/v1/rounds/{round_['id']}/comment", json={"body": "追い風"})
    assert res.status_code == 200
    assert res.json()["round_id"] == round_["id"]

    get_res = client.get(f"/api/v1/rounds/{round_['id']}/comment")
    assert get_res.status_code == 200
    assert get_res.json()["body"] == "追い風"


def test_save_and_get_end_comment(client: TestClient) -> None:
    _, _, end = _create_game_tree(client)

    res = client.put(f"/api/v1/ends/{end['id']}/comment", json={"body": "押し手が緩んだ"})
    assert res.status_code == 200
    assert res.json()["end_id"] == end["id"]

    get_res = client.get(f"/api/v1/ends/{end['id']}/comment")
    assert get_res.status_code == 200
    assert get_res.json()["body"] == "押し手が緩んだ"


def test_get_missing_comment_returns_404(client: TestClient) -> None:
    game, round_, end = _create_game_tree(client)

    assert client.get(f"/api/v1/games/{game['id']}/comment").status_code == 404
    assert client.get(f"/api/v1/rounds/{round_['id']}/comment").status_code == 404
    assert client.get(f"/api/v1/ends/{end['id']}/comment").status_code == 404


def test_save_comment_under_missing_entity_returns_404(client: TestClient) -> None:
    assert client.put("/api/v1/games/999/comment", json={"body": "x"}).status_code == 404
    assert client.put("/api/v1/rounds/999/comment", json={"body": "x"}).status_code == 404
    assert client.put("/api/v1/ends/999/comment", json={"body": "x"}).status_code == 404


def test_empty_body_is_rejected(client: TestClient) -> None:
    game = _create_game(client)
    res = client.put(f"/api/v1/games/{game['id']}/comment", json={"body": ""})
    assert res.status_code == 422


def test_too_long_body_is_rejected(client: TestClient) -> None:
    game = _create_game(client)
    res = client.put(f"/api/v1/games/{game['id']}/comment", json={"body": "あ" * 1001})
    assert res.status_code == 422


def test_delete_comment(client: TestClient) -> None:
    game = _create_game(client)
    client.put(f"/api/v1/games/{game['id']}/comment", json={"body": "消す"})

    assert client.delete(f"/api/v1/games/{game['id']}/comment").status_code == 204
    assert client.get(f"/api/v1/games/{game['id']}/comment").status_code == 404
    assert client.delete(f"/api/v1/games/{game['id']}/comment").status_code == 404


def test_list_comments_for_game(client: TestClient) -> None:
    game, round_, end = _create_game_tree(client)
    second_end = _create_end(client, round_["id"], number=2)

    client.put(f"/api/v1/games/{game['id']}/comment", json={"body": "ゲーム"})
    client.put(f"/api/v1/rounds/{round_['id']}/comment", json={"body": "ラウンド"})
    client.put(f"/api/v1/ends/{end['id']}/comment", json={"body": "エンド1"})
    client.put(f"/api/v1/ends/{second_end['id']}/comment", json={"body": "エンド2"})

    res = client.get(f"/api/v1/games/{game['id']}/comments")
    assert res.status_code == 200
    body = res.json()
    assert body["game"]["body"] == "ゲーム"
    assert [c["body"] for c in body["rounds"]] == ["ラウンド"]
    assert [c["body"] for c in body["ends"]] == ["エンド1", "エンド2"]


def test_list_comments_for_game_without_comments(client: TestClient) -> None:
    game = _create_game(client)

    res = client.get(f"/api/v1/games/{game['id']}/comments")
    assert res.status_code == 200
    assert res.json() == {"game": None, "rounds": [], "ends": []}


def test_list_comments_for_missing_game_returns_404(client: TestClient) -> None:
    assert client.get("/api/v1/games/999/comments").status_code == 404


def test_deleting_a_round_hides_its_comments(client: TestClient) -> None:
    game, round_, end = _create_game_tree(client)
    client.put(f"/api/v1/rounds/{round_['id']}/comment", json={"body": "ラウンド"})
    client.put(f"/api/v1/ends/{end['id']}/comment", json={"body": "エンド"})

    assert client.delete(f"/api/v1/rounds/{round_['id']}").status_code == 204

    body = client.get(f"/api/v1/games/{game['id']}/comments").json()
    assert body["rounds"] == []
    assert body["ends"] == []
