from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import End, Game, Region, Round, User
from mods import factory_db

GAME_RECORDED_AT = "2026-01-01T00:00:00Z"


def _day(recorded_at: str) -> date:
    return date.fromisoformat(recorded_at[:10])


# 集計は他人の行も読むので、持ち主がだれでもいいデータは API ではなく factory で作る
# (API で作れるのは本人の行だけ)
def _create_game(
    client: TestClient,
    *,
    user_id: int | None = None,
    recorded_at: str = GAME_RECORDED_AT,
    bow_type: str | None = None,
) -> dict:
    if user_id is None:
        user_id = client.get("/api/v1/users/me").json()["id"]
    game = factory_db.GameFactory(
        user=factory_db.FactorySession.get(User, user_id),
        recorded_at=_day(recorded_at),
        bow_type=bow_type,
    )
    return {"id": game.id}


def _create_own_game_via_api(client: TestClient, *, bow_type: str | None = None) -> dict:
    user_id = client.get("/api/v1/users/me").json()["id"]
    payload = {"recorded_at": GAME_RECORDED_AT, "user_id": user_id, "bow_type": bow_type}
    res = client.post("/api/v1/games", json=payload)
    assert res.status_code == 201
    return res.json()


def _create_round(
    client: TestClient, game_id: int, *, recorded_at: str, distance_m: int = 30, number: int = 1
) -> dict:
    game = factory_db.FactorySession.get(Game, game_id)
    round_ = factory_db.RoundFactory(
        game=game, number=number, recorded_at=_day(recorded_at), distance_m=distance_m
    )
    return {"id": round_.id}


def _create_end(client: TestClient, round_id: int, *, recorded_at: str) -> dict:
    round_ = factory_db.FactorySession.get(Round, round_id)
    end = factory_db.EndFactory(round=round_, number=1, recorded_at=_day(recorded_at))
    return {"id": end.id}


def _create_point(client: TestClient, end_id: int, *, score: int, recorded_at: str) -> dict:
    end = factory_db.FactorySession.get(End, end_id)
    point = factory_db.PointFactory(
        end=end, number=1, score=score, x=0.0, y=0.0, recorded_at=_day(recorded_at)
    )
    return {"id": point.id}


def _build_round(
    client: TestClient,
    game_id: int,
    *,
    recorded_at: str,
    scores: list[int],
    distance_m: int = 30,
    number: int = 1,
) -> dict:
    round_ = _create_round(
        client, game_id, recorded_at=recorded_at, distance_m=distance_m, number=number
    )
    end = _create_end(client, round_["id"], recorded_at=recorded_at)
    for score in scores:
        _create_point(client, end["id"], score=score, recorded_at=recorded_at)
    return round_


def test_round_scores_are_aggregated(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _build_round(client, game["id"], recorded_at="2026-01-05T00:00:00Z", scores=[9, 7, 8])

    res = client.get("/api/v1/statistics/rounds")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["round_id"] == round_["id"]
    assert body[0]["arrow_count"] == 3
    assert body[0]["total_score"] == 24
    assert body[0]["average_score"] == 8.0


def test_round_score_summary_min_max_average_median(client: TestClient) -> None:
    game = _create_game(client)
    _build_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10, 10])  # 20
    _build_round(client, game["id"], recorded_at="2026-01-02T00:00:00Z", scores=[5, 5])  # 10
    _build_round(client, game["id"], recorded_at="2026-01-03T00:00:00Z", scores=[9, 9])  # 18

    res = client.get("/api/v1/statistics/rounds/summary")
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 3
    assert body["total"] == 48
    assert body["min"] == 10
    assert body["max"] == 20
    assert body["average"] == 16.0
    assert body["median"] == 18.0


def test_round_score_summary_filters_by_period(client: TestClient) -> None:
    game = _create_game(client)
    _build_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10])
    _build_round(client, game["id"], recorded_at="2026-02-01T00:00:00Z", scores=[2])

    res = client.get(
        "/api/v1/statistics/rounds/summary",
        params={"start": "2026-01-15T00:00:00Z"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 1
    assert body["total"] == 2


def test_round_score_summary_filters_by_user(client: TestClient) -> None:
    game_a = _create_game(client, user_id=None)
    _build_round(client, game_a["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10])

    other = factory_db.UserFactory(profile_visibility="public")
    res = client.get("/api/v1/statistics/rounds/summary", params={"user_id": other.id})
    assert res.status_code == 200
    assert res.json()["count"] == 0


def test_end_score_summary(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z")
    end_a = _create_end(client, round_["id"], recorded_at="2026-01-01T00:00:00Z")
    end_b = _create_end(client, round_["id"], recorded_at="2026-01-02T00:00:00Z")
    _create_point(client, end_a["id"], score=9, recorded_at="2026-01-01T00:00:00Z")
    _create_point(client, end_a["id"], score=9, recorded_at="2026-01-01T00:00:00Z")
    _create_point(client, end_b["id"], score=5, recorded_at="2026-01-02T00:00:00Z")
    _create_point(client, end_b["id"], score=7, recorded_at="2026-01-02T00:00:00Z")

    list_res = client.get("/api/v1/statistics/ends")
    assert list_res.status_code == 200
    totals = sorted(row["total_score"] for row in list_res.json())
    assert totals == [12, 18]

    summary_res = client.get("/api/v1/statistics/ends/summary")
    assert summary_res.status_code == 200
    body = summary_res.json()
    assert body["count"] == 2
    assert body["min"] == 12
    assert body["max"] == 18
    assert body["average"] == 15.0
    assert body["median"] == 15.0


def test_point_score_summary(client: TestClient) -> None:
    game = _create_game(client)
    round_ = _create_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z")
    end = _create_end(client, round_["id"], recorded_at="2026-01-01T00:00:00Z")
    for score in [10, 9, 5, 1]:
        _create_point(client, end["id"], score=score, recorded_at="2026-01-01T00:00:00Z")

    res = client.get("/api/v1/statistics/points/summary")
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 4
    assert body["total"] == 25
    assert body["min"] == 1
    assert body["max"] == 10
    assert body["average"] == 6.25
    assert body["median"] == 7.0


def _create_user(
    client: TestClient,
    *,
    name: str,
    organization_id: int | None = None,
    region_id: int | None = None,
) -> dict:
    # ランキングの絞り込み・並びを確かめるので、公開範囲で落ちないよう全体公開にする
    user = factory_db.UserFactory(
        name=name,
        organization_id=organization_id,
        region_id=region_id,
        ranking_visibility="public",
    )
    return {"id": user.id}


def _create_organization(client: TestClient, *, name: str) -> dict:
    res = client.post("/api/v1/organizations", json={"name": name})
    assert res.status_code == 201
    return res.json()


def test_ranking_orders_users_by_total_score_desc_by_default(client: TestClient) -> None:
    high = _create_user(client, name="high")
    low = _create_user(client, name="low")
    high_game = _create_game(client, user_id=high["id"])
    _build_round(client, high_game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10, 10])
    low_game = _create_game(client, user_id=low["id"])
    _build_round(client, low_game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[1, 1])

    res = client.get("/api/v1/statistics/ranking")
    assert res.status_code == 200
    body = res.json()
    assert [row["user"]["name"] for row in body] == ["high", "low"]
    assert [row["rank"] for row in body] == [1, 2]
    assert body[0]["value"] == 20.0
    assert body[0]["round_count"] == 1
    assert body[0]["arrow_count"] == 2
    assert body[1]["value"] == 2.0


def test_ranking_sums_multiple_games_per_user(client: TestClient) -> None:
    user = _create_user(client, name="steady")
    game_a = _create_game(client, user_id=user["id"])
    _build_round(client, game_a["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10])
    game_b = _create_game(client, user_id=user["id"])
    _build_round(client, game_b["id"], recorded_at="2026-01-02T00:00:00Z", scores=[4])

    res = client.get("/api/v1/statistics/ranking")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["round_count"] == 2
    assert body[0]["value"] == 14.0


def test_ranking_filters_by_organization(client: TestClient) -> None:
    org_a = _create_organization(client, name="Club A")
    org_b = _create_organization(client, name="Club B")
    user_a = _create_user(client, name="member_a", organization_id=org_a["id"])
    user_b = _create_user(client, name="member_b", organization_id=org_b["id"])
    game_a = _create_game(client, user_id=user_a["id"])
    _build_round(client, game_a["id"], recorded_at="2026-01-01T00:00:00Z", scores=[9])
    game_b = _create_game(client, user_id=user_b["id"])
    _build_round(client, game_b["id"], recorded_at="2026-01-01T00:00:00Z", scores=[3])

    res = client.get("/api/v1/statistics/ranking", params={"organization_id": org_a["id"]})
    assert res.status_code == 200
    body = res.json()
    assert [row["user"]["name"] for row in body] == ["member_a"]


def test_ranking_filters_by_region(client: TestClient, s: Session) -> None:
    # No API creates Region rows yet, so insert them directly.
    region_tokyo = Region(name="Tokyo")
    region_osaka = Region(name="Osaka")
    s.add_all([region_tokyo, region_osaka])
    s.commit()

    tokyo = _create_user(client, name="tokyo_user", region_id=region_tokyo.id)
    osaka = _create_user(client, name="osaka_user", region_id=region_osaka.id)
    tokyo_game = _create_game(client, user_id=tokyo["id"])
    _build_round(client, tokyo_game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[9])
    osaka_game = _create_game(client, user_id=osaka["id"])
    _build_round(client, osaka_game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[3])

    res = client.get("/api/v1/statistics/ranking", params={"region_id": region_tokyo.id})
    assert res.status_code == 200
    body = res.json()
    assert [row["user"]["name"] for row in body] == ["tokyo_user"]


def test_ranking_filters_by_period(client: TestClient) -> None:
    user = _create_user(client, name="player")
    early_game = _create_game(client, user_id=user["id"], recorded_at="2026-01-01T00:00:00Z")
    late_game = _create_game(client, user_id=user["id"], recorded_at="2026-02-01T00:00:00Z")
    _build_round(client, early_game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10])
    _build_round(client, late_game["id"], recorded_at="2026-02-01T00:00:00Z", scores=[2])

    res = client.get("/api/v1/statistics/ranking", params={"start": "2026-01-15T00:00:00Z"})
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["round_count"] == 1
    assert body[0]["value"] == 2.0


def test_ranking_excludes_users_without_games(client: TestClient) -> None:
    _create_user(client, name="no_games")

    res = client.get("/api/v1/statistics/ranking")
    assert res.status_code == 200
    assert res.json() == []


def test_summary_with_no_data_returns_empty_statistics(client: TestClient) -> None:
    res = client.get("/api/v1/statistics/rounds/summary")
    assert res.status_code == 200
    body = res.json()
    assert body == {
        "count": 0,
        "total": 0,
        "min": None,
        "max": None,
        "average": None,
        "median": None,
    }


def test_ranking_filters_by_period_end(client: TestClient) -> None:
    user = _create_user(client, name="player")
    early_game = _create_game(client, user_id=user["id"], recorded_at="2026-01-01T00:00:00Z")
    late_game = _create_game(client, user_id=user["id"], recorded_at="2026-02-01T00:00:00Z")
    _build_round(client, early_game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10])
    _build_round(client, late_game["id"], recorded_at="2026-02-01T00:00:00Z", scores=[2])

    res = client.get("/api/v1/statistics/ranking", params={"end": "2026-01-15T00:00:00Z"})
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["round_count"] == 1
    assert body[0]["value"] == 10.0


def test_ranking_filters_by_both_period_bounds(client: TestClient) -> None:
    user = _create_user(client, name="player")
    for recorded_at, score in [
        ("2026-01-01T00:00:00Z", 10),
        ("2026-02-01T00:00:00Z", 8),
        ("2026-03-01T00:00:00Z", 6),
    ]:
        game = _create_game(client, user_id=user["id"], recorded_at=recorded_at)
        _build_round(client, game["id"], recorded_at=recorded_at, scores=[score])

    res = client.get(
        "/api/v1/statistics/ranking",
        params={"start": "2026-01-15T00:00:00Z", "end": "2026-02-15T00:00:00Z"},
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["round_count"] == 1
    assert body[0]["value"] == 8.0


def _ranking(client: TestClient, **params: str | int) -> list[dict]:
    res = client.get("/api/v1/statistics/ranking", params=params)
    assert res.status_code == 200
    return res.json()


def test_ranking_metrics_differ_in_how_they_rank(client: TestClient) -> None:
    # volume は 3 ラウンドで合計が多いが、1 本あたりも 1 ラウンドあたりも低い。
    # sharp は 1 ラウンドだけ、1 本あたりが高い。
    volume = _create_user(client, name="volume")
    sharp = _create_user(client, name="sharp")
    volume_game = _create_game(client, user_id=volume["id"])
    for number in (1, 2, 3):
        _build_round(
            client,
            volume_game["id"],
            recorded_at="2026-01-01T00:00:00Z",
            scores=[6, 6, 6, 6],
            number=number,
        )
    sharp_game = _create_game(client, user_id=sharp["id"])
    _build_round(client, sharp_game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10, 10])

    total = _ranking(client, metric="total_score")
    assert [(row["user"]["name"], row["value"]) for row in total] == [
        ("volume", 72.0),
        ("sharp", 20.0),
    ]
    average_round = _ranking(client, metric="average_round_score")
    assert [(row["user"]["name"], row["value"]) for row in average_round] == [
        ("volume", 24.0),
        ("sharp", 20.0),
    ]
    average_point = _ranking(client, metric="average_point_score")
    assert [(row["user"]["name"], row["value"]) for row in average_point] == [
        ("sharp", 10.0),
        ("volume", 6.0),
    ]
    assert average_point[1]["round_count"] == 3
    assert average_point[1]["arrow_count"] == 12


def test_ranking_counts_x_as_ten_and_miss_as_zero(client: TestClient) -> None:
    user = _create_user(client, name="player")
    game = _create_game(client, user_id=user["id"])
    _build_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[11, 0, 8])

    body = _ranking(client, metric="average_point_score")
    assert body[0]["value"] == 6.0


def test_ranking_rejects_an_unknown_metric(client: TestClient) -> None:
    res = client.get("/api/v1/statistics/ranking", params={"metric": "median"})
    assert res.status_code == 422


def test_ranking_filters_by_bow_type(client: TestClient) -> None:
    recurve = _create_user(client, name="recurve_user")
    compound = _create_user(client, name="compound_user")
    unset = _create_user(client, name="unset_user")
    for user, bow_type, score in [
        (recurve, "recurve", 9),
        (compound, "compound", 10),
        (unset, None, 8),
    ]:
        game = _create_game(client, user_id=user["id"], bow_type=bow_type)
        _build_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[score])

    assert [row["user"]["name"] for row in _ranking(client, bow_type="recurve")] == ["recurve_user"]
    assert [row["user"]["name"] for row in _ranking(client, bow_type="barebow")] == []
    # 絞り込まなければ、弓の種類が未設定の記録も数える
    assert [row["user"]["name"] for row in _ranking(client)] == [
        "compound_user",
        "recurve_user",
        "unset_user",
    ]


def test_ranking_rejects_an_unknown_bow_type(client: TestClient) -> None:
    res = client.get("/api/v1/statistics/ranking", params={"bow_type": "crossbow"})
    assert res.status_code == 422


def test_ranking_filters_by_distance_per_round(client: TestClient) -> None:
    # 一つのゲームの中で距離を変えたラウンドは、距離ごとに別々に数える
    user = _create_user(client, name="player")
    game = _create_game(client, user_id=user["id"])
    _build_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[10], distance_m=70)
    _build_round(
        client,
        game["id"],
        recorded_at="2026-01-01T00:00:00Z",
        scores=[4],
        distance_m=30,
        number=2,
    )

    near = _ranking(client, distance_m=30)
    assert [(row["value"], row["round_count"]) for row in near] == [(4.0, 1)]
    far = _ranking(client, distance_m=70)
    assert [(row["value"], row["round_count"]) for row in far] == [(10.0, 1)]
    assert _ranking(client, distance_m=18) == []
    assert _ranking(client)[0]["value"] == 14.0


def test_ranking_combines_bow_type_distance_and_period(client: TestClient) -> None:
    user = _create_user(client, name="player")
    for recorded_at, bow_type, distance_m, score in [
        ("2026-01-10T00:00:00Z", "recurve", 70, 10),
        ("2026-02-10T00:00:00Z", "recurve", 70, 7),
        ("2026-02-11T00:00:00Z", "recurve", 30, 5),
        ("2026-02-12T00:00:00Z", "compound", 70, 3),
    ]:
        game = _create_game(client, user_id=user["id"], recorded_at=recorded_at, bow_type=bow_type)
        _build_round(
            client, game["id"], recorded_at=recorded_at, scores=[score], distance_m=distance_m
        )

    body = _ranking(
        client,
        bow_type="recurve",
        distance_m=70,
        start="2026-02-01T00:00:00Z",
        end="2026-02-28T00:00:00Z",
    )
    assert [(row["value"], row["round_count"]) for row in body] == [(7.0, 1)]


def test_ranking_ignores_rounds_without_arrows(client: TestClient) -> None:
    user = _create_user(client, name="player")
    game = _create_game(client, user_id=user["id"])
    _build_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[8, 8])
    _create_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z", number=2)

    body = _ranking(client, metric="average_round_score")
    assert [(row["value"], row["round_count"]) for row in body] == [(16.0, 1)]


def test_ranking_excludes_deleted_games(client: TestClient) -> None:
    game = _create_game(client)
    _build_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[9])
    assert client.delete(f"/api/v1/games/{game['id']}").status_code == 204

    assert _ranking(client) == []


def test_ranking_paginates_with_the_rank_continuing(client: TestClient) -> None:
    for name, score in [("a", 9), ("b", 8), ("c", 7)]:
        user = _create_user(client, name=name)
        game = _create_game(client, user_id=user["id"])
        _build_round(client, game["id"], recorded_at="2026-01-01T00:00:00Z", scores=[score])

    page = _ranking(client, skip=1, limit=1)
    assert [(row["rank"], row["user"]["name"]) for row in page] == [(2, "b")]


def test_game_keeps_its_bow_type(client: TestClient) -> None:
    game = _create_own_game_via_api(client, bow_type="barebow")
    assert game["bow_type"] == "barebow"
    assert client.get(f"/api/v1/games/{game['id']}").json()["bow_type"] == "barebow"

    res = client.patch(f"/api/v1/games/{game['id']}", json={"bow_type": "compound"})
    assert res.status_code == 200
    assert res.json()["bow_type"] == "compound"

    res = client.patch(f"/api/v1/games/{game['id']}", json={"bow_type": "和弓"})
    assert res.status_code == 200
    assert res.json()["bow_type"] == "和弓"

    for bow_type in ["", "x" * 21]:
        res = client.post(
            "/api/v1/games",
            json={
                "user_id": game["user_id"],
                "recorded_at": GAME_RECORDED_AT,
                "bow_type": bow_type,
            },
        )
        assert res.status_code == 422


def test_statistics_are_filtered_by_game_kind(client: TestClient) -> None:
    recurve = _create_game(client, bow_type="recurve")
    compound = _create_game(client, bow_type="compound")
    _build_round(client, recurve["id"], recorded_at=GAME_RECORDED_AT, scores=[9, 9], distance_m=70)
    _build_round(client, recurve["id"], recorded_at=GAME_RECORDED_AT, scores=[5, 5], distance_m=30)
    _build_round(
        client, compound["id"], recorded_at=GAME_RECORDED_AT, scores=[10, 10], distance_m=70
    )

    rounds = client.get("/api/v1/statistics/rounds", params={"bow_type": "recurve"}).json()
    assert sorted(r["total_score"] for r in rounds) == [10, 18]

    params = {"bow_type": "recurve", "distance_m": 70}
    for path, expected_total in [
        ("/statistics/rounds/summary", 18),
        ("/statistics/ends/summary", 18),
        ("/statistics/points/summary", 18),
    ]:
        body = client.get(f"/api/v1{path}", params=params).json()
        assert body["total"] == expected_total, path

    ends = client.get("/api/v1/statistics/ends", params={"distance_m": 70}).json()
    assert sorted(e["total_score"] for e in ends) == [18, 20]

    assert client.get("/api/v1/statistics/rounds", params={"distance_m": 50}).json() == []


def test_game_kind_options_list_own_values_only(client: TestClient, factories) -> None:
    game = _create_game(client, bow_type="recurve")
    game_model = factory_db.FactorySession.get(Game, game["id"])
    assert game_model is not None
    game_model.game_size = 2
    factory_db.RoundFactory(
        game=game_model, distance_m=70, target_type="122cm", end_size=6, round_size=6
    )
    factory_db.RoundFactory(
        game=game_model, distance_m=30, target_type="80cm", end_size=3, round_size=10
    )
    other = factories.GameFactory(bow_type="barebow")
    factories.RoundFactory(game=other, distance_m=18)

    res = client.get("/api/v1/statistics/game-kinds")
    assert res.status_code == 200
    assert res.json() == {
        "bow_types": ["recurve"],
        "distances_m": [30, 70],
        "target_types": ["122cm", "80cm"],
        "end_sizes": [3, 6],
        "round_sizes": [6, 10],
        "game_sizes": [2],
    }


def _ranked_names(client: TestClient) -> list[str]:
    return [row["user"]["name"] for row in _ranking(client)]


def _user_with_a_round(
    client: TestClient,
    name: str,
    *,
    ranking_visibility: str,
    organization_id: int | None = None,
) -> None:
    user = factory_db.UserFactory(
        name=name, organization_id=organization_id, ranking_visibility=ranking_visibility
    )
    game = _create_game(client, user_id=user.id)
    _build_round(client, game["id"], recorded_at=GAME_RECORDED_AT, scores=[5])


def test_ranking_lists_public_users_and_same_organization_users_only(
    client: TestClient, current_user, factories
) -> None:
    organization = factories.OrganizationFactory()
    current_user.organization_id = organization.id
    _user_with_a_round(client, "public", ranking_visibility="public")
    _user_with_a_round(
        client,
        "same_organization", ranking_visibility="organization", organization_id=organization.id
    )
    _user_with_a_round(
        client,
        "other_organization",
        ranking_visibility="organization",
        organization_id=factories.OrganizationFactory().id,
    )
    _user_with_a_round(client, "no_organization", ranking_visibility="organization")
    _user_with_a_round(
        client,
        "private_same_organization", ranking_visibility="private", organization_id=organization.id
    )

    assert sorted(_ranked_names(client)) == ["public", "same_organization"]


def test_ranking_hides_organization_rankings_from_a_viewer_without_an_organization(
    client: TestClient,
) -> None:
    _user_with_a_round(client, "no_organization", ranking_visibility="organization")

    assert _ranked_names(client) == []


def test_ranking_follows_the_viewers_own_visibility_too(
    client: TestClient, current_user, s: Session
) -> None:
    # 非公開なら、本人のランキングにも本人を載せない(載っていると他人にも見えると読めてしまう)
    _build_round(client, _create_game(client)["id"], recorded_at=GAME_RECORDED_AT, scores=[10])
    assert _ranked_names(client) == []

    current_user.ranking_visibility = "public"
    s.commit()
    assert _ranked_names(client) == [current_user.name]
