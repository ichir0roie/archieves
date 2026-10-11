from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.scoring import X_SCORE
from app.db import Game, Point, Round

SHEET_URL = "/api/v1/games/sheet"


def _point(number: int, score: int, **fields) -> dict:
    return {
        "number": number,
        "score": score,
        "x": 0.5,
        "y": 0.5,
        "recorded_at": "2026-10-11",
        "shot_at": f"2026-10-11T09:0{number}:00+09:00",
        **fields,
    }


def _end(number: int, points: list[dict], **fields) -> dict:
    return {"number": number, "recorded_at": "2026-10-11", "points": points, **fields}


def _round(number: int, ends: list[dict], **fields) -> dict:
    return {
        "number": number,
        "recorded_at": "2026-10-11",
        "end_size": 3,
        "round_size": 2,
        "distance_m": 70,
        "target_type": "122cm",
        "ends": ends,
        **fields,
    }


def _sheet(rounds: list[dict], **fields) -> dict:
    return {
        "client_key": "key-1",
        "recorded_at": "2026-10-11",
        "game_size": 2,
        "bow_type": "recurve",
        "rounds": rounds,
        **fields,
    }


def _save(client: TestClient, sheet: dict) -> dict:
    response = client.put(SHEET_URL, json=sheet)
    assert response.status_code == 200, response.json()
    return response.json()


def test_a_sheet_without_an_id_creates_the_whole_game(client: TestClient, current_user) -> None:
    saved = _save(
        client,
        _sheet(
            [
                _round(
                    1,
                    [
                        _end(1, [_point(1, 10), _point(2, 9)], comment="押し手"),
                        _end(2, [_point(1, X_SCORE)]),
                    ],
                    comment="向かい風",
                )
            ],
            comment="大会",
        ),
    )

    assert saved["id"] > 0
    assert saved["user_id"] == current_user.id
    assert saved["client_key"] == "key-1"
    assert saved["comment"] == "大会"
    [round_] = saved["rounds"]
    assert round_["comment"] == "向かい風"
    assert [end["comment"] for end in round_["ends"]] == ["押し手", None]
    first_end = round_["ends"][0]
    assert [point["score"] for point in first_end["points"]] == [10, 9]
    assert first_end["points"][0]["shot_at"] == "2026-10-11T00:01:00Z"
    # 的の中心(0.5, 0.5)は、的の大きさに依らず 0cm
    assert first_end["points"][0]["x_cm"] == 0.0

    # 読み込みも同じ形を返す
    assert client.get(f"/api/v1/games/{saved['id']}/sheet").json() == saved


def test_resending_a_new_sheet_with_the_same_client_key_does_not_duplicate_the_game(
    client: TestClient, s: Session, current_user
) -> None:
    # 応答を失って送り直した(id はまだ知らない)
    sheet = _sheet([_round(1, [_end(1, [_point(1, 10)])])])
    first = _save(client, sheet)
    second = _save(client, sheet)

    assert second["id"] == first["id"]
    games = s.scalars(select(Game).where(Game.user_id == current_user.id)).all()
    assert len(games) == 1
    assert [point["score"] for point in second["rounds"][0]["ends"][0]["points"]] == [10]


def test_a_sheet_with_an_id_overwrites_rows_by_id_and_removes_what_was_left_out(
    client: TestClient, s: Session
) -> None:
    saved = _save(
        client,
        _sheet(
            [
                _round(1, [_end(1, [_point(1, 10), _point(2, 9)], comment="a"), _end(2, [])]),
                _round(2, [_end(1, [_point(1, 5)])], comment="b"),
            ],
            comment="c",
        ),
    )
    round_1 = saved["rounds"][0]
    end_1 = round_1["ends"][0]
    kept_point = end_1["points"][0]

    updated = _save(
        client,
        _sheet(
            [
                _round(
                    1,
                    [
                        _end(
                            1,
                            [
                                {**_point(1, 8), "id": kept_point["id"]},
                                _point(2, 7),
                            ],
                            id=end_1["id"],
                            comment=" ",
                        )
                    ],
                    id=round_1["id"],
                    comment="new",
                ),
            ],
            id=saved["id"],
            comment=None,
        ),
    )

    assert updated["id"] == saved["id"]
    assert updated["comment"] is None
    [round_] = updated["rounds"]
    assert round_["id"] == round_1["id"]
    assert round_["comment"] == "new"
    [end] = round_["ends"]
    assert end["id"] == end_1["id"]
    assert end["comment"] is None
    assert [point["score"] for point in end["points"]] == [8, 7]
    assert end["points"][0]["id"] == kept_point["id"]
    # 外した 2 本目は消え、新しい 2 本目が作られる
    assert s.get(Point, end_1["points"][1]["id"]) is None

    # 送らなかったラウンドはゴミ箱へ(一つずつ消すときと同じ)
    removed_round = s.get(Round, saved["rounds"][1]["id"])
    assert removed_round is not None
    assert removed_round.deleted_at is not None


def test_a_sheet_cannot_write_into_another_users_game(client: TestClient, factories) -> None:
    other = factories.GameFactory()

    response = client.put(SHEET_URL, json=_sheet([], id=other.id))

    assert response.status_code == 403


def test_a_sheet_for_a_missing_game_is_not_found(client: TestClient) -> None:
    assert client.put(SHEET_URL, json=_sheet([], id=999_999_999)).status_code == 404


def test_a_sheet_cannot_move_a_round_from_another_game(client: TestClient) -> None:
    first = _save(client, _sheet([_round(1, [])], client_key="first"))
    second = _save(client, _sheet([], client_key="second"))

    response = client.put(
        SHEET_URL,
        json=_sheet([_round(1, [], id=first["rounds"][0]["id"])], id=second["id"]),
    )

    assert response.status_code == 404


def test_a_sheet_rejects_a_score_the_target_cannot_give(client: TestClient) -> None:
    sheet = _sheet([_round(1, [_end(1, [_point(1, X_SCORE)])], target_type="compound")])

    assert client.put(SHEET_URL, json=sheet).status_code == 422


def test_a_new_round_must_use_a_known_target_type(client: TestClient) -> None:
    sheet = _sheet([_round(1, [], target_type="60cm-old")])

    assert client.put(SHEET_URL, json=sheet).status_code == 422


def test_an_old_round_with_an_unknown_target_type_can_be_sent_back_as_is(
    client: TestClient, factories, current_user
) -> None:
    # 取り込んだ古い記録は、決まった的の種類の外の値を持つ
    game = factories.GameFactory(user=current_user)
    old = factories.RoundFactory(game=game, target_type="60cm-old")
    sheet = client.get(f"/api/v1/games/{game.id}/sheet").json()

    response = client.put(SHEET_URL, json=sheet)

    assert response.status_code == 200
    assert response.json()["rounds"][0]["id"] == old.id
    assert response.json()["rounds"][0]["target_type"] == "60cm-old"


def test_the_sheet_of_a_deleted_game_is_not_found(client: TestClient) -> None:
    saved = _save(client, _sheet([]))
    client.delete(f"/api/v1/games/{saved['id']}")

    assert client.get(f"/api/v1/games/{saved['id']}/sheet").status_code == 404
    assert client.put(SHEET_URL, json=_sheet([])).status_code == 404


def test_the_arrow_diameter_is_kept_per_game(client: TestClient) -> None:
    saved = _save(client, _sheet([], arrow_diameter_px=16))

    assert saved["arrow_diameter_px"] == 16
    assert client.get(f"/api/v1/games/{saved['id']}").json()["arrow_diameter_px"] == 16

    updated = _save(client, _sheet([], id=saved["id"], arrow_diameter_px=None))
    assert updated["arrow_diameter_px"] is None


def test_an_arrow_diameter_outside_the_range_is_rejected(client: TestClient) -> None:
    assert client.put(SHEET_URL, json=_sheet([], arrow_diameter_px=1)).status_code == 422
    assert client.put(SHEET_URL, json=_sheet([], arrow_diameter_px=41)).status_code == 422
