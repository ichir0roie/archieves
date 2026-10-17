from datetime import date

import pytest
from fastapi.testclient import TestClient

RECORDED_AT = "2026-01-01T00:00:00Z"


def _create_game(client: TestClient) -> dict:
    res = client.post("/api/v1/games", json={"recorded_at": RECORDED_AT})
    assert res.status_code == 201
    return res.json()


def _create_round(client: TestClient, game_id: int) -> dict:
    payload = {
        "number": 1,
        "recorded_at": RECORDED_AT,
        "end_size": 6,
        "distance_m": 30,
        "target_type": "122cm",
    }
    res = client.post(f"/api/v1/games/{game_id}/rounds", json=payload)
    assert res.status_code == 201
    return res.json()


def _create_end(client: TestClient, round_id: int) -> dict:
    payload = {"number": 1, "recorded_at": RECORDED_AT}
    res = client.post(f"/api/v1/rounds/{round_id}/ends", json=payload)
    assert res.status_code == 201
    return res.json()


def _create_point(client: TestClient, end_id: int) -> dict:
    payload = {"number": 1, "score": 9, "x": 0.6, "y": 0.4, "recorded_at": RECORDED_AT}
    res = client.post(f"/api/v1/ends/{end_id}/points", json=payload)
    assert res.status_code == 201
    return res.json()


def test_creating_game_without_recorded_at_returns_422(client: TestClient) -> None:
    res = client.post("/api/v1/games", json={})
    assert res.status_code == 422


def test_a_created_game_belongs_to_me_whatever_user_id_is_sent(
    client: TestClient, current_user, factories
) -> None:
    other = factories.UserFactory()

    res = client.post("/api/v1/games", json={"recorded_at": RECORDED_AT, "user_id": other.id})

    assert res.status_code == 201
    assert res.json()["user_id"] == current_user.id


def test_create_and_get_game(client: TestClient) -> None:
    game = _create_game(client)

    get_res = client.get(f"/api/v1/games/{game['id']}")
    assert get_res.status_code == 200
    assert get_res.json() == game


def test_get_missing_game_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/games/999")
    assert response.status_code == 404


def test_list_games_returns_only_my_games(client: TestClient, factories) -> None:
    own_game = _create_game(client)
    other = factories.GameFactory().user

    # 持ち主は要求で受けない。他人の user_id を付けても本人の分だけ
    for url in ["/api/v1/games", f"/api/v1/games?user_id={other.id}"]:
        response = client.get(url)
        assert response.status_code == 200
        assert [g["id"] for g in response.json()] == [own_game["id"]]


def test_list_game_scores(client: TestClient, current_user, factories) -> None:
    game = factories.GameFactory(user=current_user, recorded_at=date(2026, 1, 1))
    round_ = factories.RoundFactory(game=game)
    end1 = factories.EndFactory(round=round_, number=1)
    end2 = factories.EndFactory(round=round_, number=2)
    factories.EndFactory(round=round_, number=3)
    for score in (10, 9, 8):
        factories.PointFactory(end=end1, score=score)
    factories.PointFactory(end=end2, score=7)
    empty = factories.GameFactory(user=current_user, recorded_at=date(2026, 2, 1))
    factories.GameFactory(user=current_user, recorded_at=date(2025, 2, 1))
    factories.GameFactory(recorded_at=date(2026, 3, 1))

    response = client.get("/api/v1/games/scores?year=2026")

    assert response.status_code == 200
    assert response.json() == [
        {"game_id": game.id, "total_score": 34, "end_average": 17.0, "point_average": 8.5},
        {"game_id": empty.id, "total_score": 0, "end_average": None, "point_average": None},
    ]


def test_list_games_by_year(client: TestClient, current_user, factories) -> None:
    old = factories.GameFactory(user=current_user, recorded_at=date(2024, 12, 31))
    new = factories.GameFactory(user=current_user, recorded_at=date(2026, 1, 1))
    factories.GameFactory(
        user=current_user,
        recorded_at=date(2026, 5, 1),
        deleted_at=date(2026, 5, 2),
    )
    factories.GameFactory(recorded_at=date(2023, 1, 1))

    assert client.get("/api/v1/games/years").json() == [2026, 2024]
    assert [g["id"] for g in client.get("/api/v1/games?year=2024").json()] == [old.id]
    assert [g["id"] for g in client.get("/api/v1/games?year=2026").json()] == [new.id]
    assert client.get("/api/v1/games?year=2025").json() == []


def test_update_and_delete_game(client: TestClient) -> None:
    game = _create_game(client)

    new_recorded_at = "2026-02-01T00:00:00Z"
    patch_res = client.patch(
        f"/api/v1/games/{game['id']}", json={"recorded_at": new_recorded_at}
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["recorded_at"] == "2026-02-01"

    delete_res = client.delete(f"/api/v1/games/{game['id']}")
    assert delete_res.status_code == 204

    assert client.get(f"/api/v1/games/{game['id']}").status_code == 404


def test_create_round_under_missing_game_returns_404(client: TestClient) -> None:
    response = client.post(
        "/api/v1/games/999/rounds",
        json={
            "number": 1,
            "recorded_at": RECORDED_AT,
            "end_size": 6,
            "distance_m": 30,
            "target_type": "122cm",
        },
    )
    assert response.status_code == 404


def test_full_hierarchy_create_and_list(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])
    point = _create_point(client, end["id"])

    assert round_["game_id"] == game["id"]
    assert end["round_id"] == round_["id"]
    assert point["end_id"] == end["id"]

    rounds_res = client.get(f"/api/v1/games/{game['id']}/rounds")
    assert rounds_res.status_code == 200
    assert [r["id"] for r in rounds_res.json()] == [round_["id"]]

    ends_res = client.get(f"/api/v1/rounds/{round_['id']}/ends")
    assert ends_res.status_code == 200
    assert [e["id"] for e in ends_res.json()] == [end["id"]]

    points_res = client.get(f"/api/v1/ends/{end['id']}/points")
    assert points_res.status_code == 200
    assert [p["id"] for p in points_res.json()] == [point["id"]]


def test_deleting_game_cascades_to_children(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])
    point = _create_point(client, end["id"])

    assert client.delete(f"/api/v1/games/{game['id']}").status_code == 204

    assert client.get(f"/api/v1/rounds/{round_['id']}").status_code == 404
    assert client.get(f"/api/v1/ends/{end['id']}").status_code == 404
    assert client.get(f"/api/v1/points/{point['id']}").status_code == 404


def test_deleting_game_is_a_soft_delete_and_is_restorable(client: TestClient) -> None:
    game = _create_game(client)

    assert client.delete(f"/api/v1/games/{game['id']}").status_code == 204
    assert client.get(f"/api/v1/games/{game['id']}").status_code == 404
    assert game["id"] not in [g["id"] for g in client.get("/api/v1/games").json()]

    trash = client.get("/api/v1/trash/games")
    assert trash.status_code == 200
    trashed_ids = [g["id"] for g in trash.json()]
    assert game["id"] in trashed_ids
    assert trash.json()[trashed_ids.index(game["id"])]["deleted_at"] is not None

    restore_res = client.post(f"/api/v1/games/{game['id']}/restore")
    assert restore_res.status_code == 200
    assert restore_res.json()["deleted_at"] is None

    get_res = client.get(f"/api/v1/games/{game['id']}")
    assert get_res.status_code == 200
    assert get_res.json()["deleted_at"] is None
    assert game["id"] not in [g["id"] for g in client.get("/api/v1/trash/games").json()]


def test_restoring_a_game_that_is_not_deleted_returns_400(client: TestClient) -> None:
    game = _create_game(client)
    assert client.post(f"/api/v1/games/{game['id']}/restore").status_code == 400


def test_restoring_missing_game_returns_404(client: TestClient) -> None:
    assert client.post("/api/v1/games/999/restore").status_code == 404


def test_deleting_round_is_a_soft_delete_and_hides_its_children(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])
    point = _create_point(client, end["id"])

    assert client.delete(f"/api/v1/rounds/{round_['id']}").status_code == 204

    assert client.get(f"/api/v1/rounds/{round_['id']}").status_code == 404
    assert client.get(f"/api/v1/ends/{end['id']}").status_code == 404
    assert client.get(f"/api/v1/points/{point['id']}").status_code == 404
    # The game itself is untouched.
    assert client.get(f"/api/v1/games/{game['id']}").status_code == 200

    trash = client.get("/api/v1/trash/rounds")
    assert trash.status_code == 200
    assert round_["id"] in [r["id"] for r in trash.json()]

    restore_res = client.post(f"/api/v1/rounds/{round_['id']}/restore")
    assert restore_res.status_code == 200
    assert restore_res.json()["deleted_at"] is None

    assert client.get(f"/api/v1/rounds/{round_['id']}").status_code == 200
    assert client.get(f"/api/v1/ends/{end['id']}").status_code == 200
    assert client.get(f"/api/v1/points/{point['id']}").status_code == 200


def test_restoring_a_round_that_is_not_deleted_returns_400(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    assert client.post(f"/api/v1/rounds/{round_['id']}/restore").status_code == 400


def test_deleted_games_and_rounds_are_excluded_from_normal_listings(
    client: TestClient,
) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    assert client.delete(f"/api/v1/rounds/{round_['id']}").status_code == 204

    assert round_["id"] not in [
        r["id"] for r in client.get(f"/api/v1/games/{game['id']}/rounds").json()
    ]


def test_get_missing_round_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/rounds/999")
    assert response.status_code == 404


def test_update_round(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])

    patch_res = client.patch(f"/api/v1/rounds/{round_['id']}", json={"distance_m": 50})
    assert patch_res.status_code == 200
    body = patch_res.json()
    assert body["distance_m"] == 50
    assert body["target_type"] == round_["target_type"]


def test_update_missing_round_returns_404(client: TestClient) -> None:
    response = client.patch("/api/v1/rounds/999", json={"distance_m": 50})
    assert response.status_code == 404


def test_restoring_missing_round_returns_404(client: TestClient) -> None:
    assert client.post("/api/v1/rounds/999/restore").status_code == 404


def test_list_deleted_rounds_lists_only_mine_and_filters_by_game_id(
    client: TestClient, factories
) -> None:
    own_game = _create_game(client)
    own_round = _create_round(client, own_game["id"])

    other_round = factories.RoundFactory(deleted_at=date(2026, 1, 2))

    assert client.delete(f"/api/v1/rounds/{own_round['id']}").status_code == 204
    assert other_round.deleted_at is not None

    by_game = client.get(f"/api/v1/trash/rounds?game_id={own_game['id']}")
    assert by_game.status_code == 200
    assert [r["id"] for r in by_game.json()] == [own_round["id"]]

    by_default = client.get("/api/v1/trash/rounds")
    assert [r["id"] for r in by_default.json()] == [own_round["id"]]

    with_other_user_id = client.get(f"/api/v1/trash/rounds?user_id={other_round.user_id}")
    assert with_other_user_id.json() == by_default.json()


def test_list_ends_under_missing_round_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/rounds/999/ends")
    assert response.status_code == 404


def test_create_end_under_missing_round_returns_404(client: TestClient) -> None:
    response = client.post(
        "/api/v1/rounds/999/ends",
        json={"number": 1, "recorded_at": RECORDED_AT},
    )
    assert response.status_code == 404


def test_get_missing_end_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/ends/999")
    assert response.status_code == 404


def test_update_end(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])

    patch_res = client.patch(f"/api/v1/ends/{end['id']}", json={"number": 2})
    assert patch_res.status_code == 200
    assert patch_res.json()["number"] == 2


def test_update_missing_end_returns_404(client: TestClient) -> None:
    response = client.patch("/api/v1/ends/999", json={"number": 2})
    assert response.status_code == 404


def test_delete_end_directly(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])

    delete_res = client.delete(f"/api/v1/ends/{end['id']}")
    assert delete_res.status_code == 204
    assert client.get(f"/api/v1/ends/{end['id']}").status_code == 404


def test_delete_missing_end_returns_404(client: TestClient) -> None:
    response = client.delete("/api/v1/ends/999")
    assert response.status_code == 404


def test_list_points_under_missing_end_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/ends/999/points")
    assert response.status_code == 404


def test_create_point_under_missing_end_returns_404(client: TestClient) -> None:
    response = client.post(
        "/api/v1/ends/999/points",
        json={"number": 1, "score": 9, "x": 0.0, "y": 0.0, "recorded_at": RECORDED_AT},
    )
    assert response.status_code == 404


def test_get_missing_point_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/points/999")
    assert response.status_code == 404


def test_update_point(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])
    point = _create_point(client, end["id"])

    patch_res = client.patch(f"/api/v1/points/{point['id']}", json={"score": 5})
    assert patch_res.status_code == 200
    assert patch_res.json()["score"] == 5


def test_update_missing_point_returns_404(client: TestClient) -> None:
    response = client.patch("/api/v1/points/999", json={"score": 5})
    assert response.status_code == 404


def test_delete_point_directly(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])
    point = _create_point(client, end["id"])

    delete_res = client.delete(f"/api/v1/points/{point['id']}")
    assert delete_res.status_code == 204
    assert client.get(f"/api/v1/points/{point['id']}").status_code == 404


def test_create_round_rejects_unknown_target_type(client: TestClient) -> None:
    game = _create_game(client)
    payload = {
        "number": 1,
        "recorded_at": RECORDED_AT,
        "end_size": 6,
        "distance_m": 30,
        "target_type": "999cm",
    }
    response = client.post(f"/api/v1/games/{game['id']}/rounds", json=payload)
    assert response.status_code == 422


def test_create_point_computes_cm_from_round_target_size(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])

    payload = {"number": 1, "score": 9, "x": 0.75, "y": 0.25, "recorded_at": RECORDED_AT}
    res = client.post(f"/api/v1/ends/{end['id']}/points", json=payload)
    assert res.status_code == 201
    body = res.json()
    assert body["x_cm"] == pytest.approx(30.5)
    assert body["y_cm"] == pytest.approx(-30.5)


def test_create_point_with_no_coordinates_has_null_cm(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])

    payload = {"number": 1, "score": 9, "x": 0.0, "y": 0.0, "recorded_at": RECORDED_AT}
    res = client.post(f"/api/v1/ends/{end['id']}/points", json=payload)
    assert res.status_code == 201
    body = res.json()
    assert body["x_cm"] is None
    assert body["y_cm"] is None


def test_update_point_recomputes_cm_on_coordinate_change(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"])
    end = _create_end(client, round_["id"])
    point = _create_point(client, end["id"])

    patch_res = client.patch(f"/api/v1/points/{point['id']}", json={"x": 1.0, "y": 0.5})
    assert patch_res.status_code == 200
    body = patch_res.json()
    assert body["x_cm"] == pytest.approx(61.0)
    assert body["y_cm"] == pytest.approx(0.0)


def test_delete_missing_point_returns_404(client: TestClient) -> None:
    response = client.delete("/api/v1/points/999")
    assert response.status_code == 404


def test_trash_games_lists_only_mine(client: TestClient, factories) -> None:
    own_game = _create_game(client)
    other_game = factories.GameFactory(deleted_at=date(2026, 1, 2))
    client.delete(f"/api/v1/games/{own_game['id']}")

    res = client.get("/api/v1/trash/games")
    assert res.status_code == 200
    assert [g["id"] for g in res.json()] == [own_game["id"]]
    assert client.get(f"/api/v1/trash/games?user_id={other_game.user_id}").json() == res.json()


@pytest.mark.parametrize(
    ("kind", "field"),
    [
        ("rounds", "number"),
        ("rounds", "recorded_at"),
        ("rounds", "end_size"),
        ("rounds", "distance_m"),
        ("rounds", "target_type"),
        ("ends", "number"),
        ("ends", "recorded_at"),
        ("points", "number"),
        ("points", "score"),
        ("points", "x"),
        ("points", "y"),
        ("points", "recorded_at"),
    ],
)
def test_update_rejects_null_for_a_required_column(
    client: TestClient,
    current_user,
    factories,
    kind: str,
    field: str,
) -> None:
    # 列は NOT NULL なので、null を通すと書くときに 500 になる
    game = factories.GameFactory(user=current_user)
    point = factories.PointFactory(end__round__game=game)
    row_id = {
        "rounds": point.end.round.id,
        "ends": point.end.id,
        "points": point.id,
    }[kind]

    assert client.patch(f"/api/v1/{kind}/{row_id}", json={field: None}).status_code == 422


def test_update_point_can_clear_the_shot_time(client: TestClient, current_user, factories) -> None:
    game = factories.GameFactory(user=current_user)
    point = factories.PointFactory(end__round__game=game)

    response = client.patch(f"/api/v1/points/{point.id}", json={"shot_at": None})

    assert response.status_code == 200
    assert response.json()["shot_at"] is None
