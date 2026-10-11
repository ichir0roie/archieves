from collections.abc import Generator
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.core.scoring import X_SCORE
from app.core.target_types import TARGET_TYPE_ERROR, TARGET_TYPE_IDS
from app.crud import game as game_crud
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


@pytest.mark.parametrize("target_type", TARGET_TYPE_IDS)
def test_every_target_type_takes_an_x(client: TestClient, target_type: str) -> None:
    sheet = _sheet([_round(1, [_end(1, [_point(1, X_SCORE)])], target_type=target_type)])

    saved = _save(client, sheet)

    assert saved["rounds"][0]["ends"][0]["points"][0]["score"] == X_SCORE


def test_the_old_compound_target_type_can_no_longer_be_chosen(client: TestClient) -> None:
    # マイグレーションで 80cm に書き換えた
    sheet = _sheet([_round(1, [], target_type="compound")])

    assert client.put(SHEET_URL, json=sheet).status_code == 422


def test_a_new_round_must_use_a_known_target_type(client: TestClient) -> None:
    sheet = _sheet([_round(1, [], target_type="60cm-old")])

    assert client.put(SHEET_URL, json=sheet).status_code == 422


def test_an_other_target_type_is_saved_with_its_diameter(client: TestClient) -> None:
    sheet = _sheet(
        [_round(1, [_end(1, [_point(1, 9, x=1.0, y=0.5)])], target_type="60cm")]
    )

    saved = _save(client, sheet)

    [round_] = saved["rounds"]
    assert round_["target_type"] == "60cm"
    # 的の右の縁は、中心から直径の半分
    assert round_["ends"][0]["points"][0]["x_cm"] == 30.0


@pytest.mark.parametrize("target_type", ["9cm", "201cm", "60.5cm", "60", "60 cm"])
def test_an_other_target_type_must_be_an_integer_diameter_in_range(
    client: TestClient, target_type: str
) -> None:
    sheet = _sheet([_round(1, [], target_type=target_type)])

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
    saved = _save(client, _sheet([], arrow_diameter_mm=6))

    assert saved["arrow_diameter_mm"] == 6
    assert client.get(f"/api/v1/games/{saved['id']}").json()["arrow_diameter_mm"] == 6

    updated = _save(client, _sheet([], id=saved["id"], arrow_diameter_mm=None))
    assert updated["arrow_diameter_mm"] is None


def test_an_arrow_diameter_outside_the_range_is_rejected(client: TestClient) -> None:
    assert client.put(SHEET_URL, json=_sheet([], arrow_diameter_mm=0)).status_code == 422
    assert client.put(SHEET_URL, json=_sheet([], arrow_diameter_mm=31)).status_code == 422
    assert client.put(SHEET_URL, json=_sheet([], arrow_diameter_mm=5.5)).status_code == 422


def test_all_in_is_kept_per_game(client: TestClient) -> None:
    saved = _save(client, _sheet([], all_in=True))

    assert saved["all_in"] is True
    assert client.get(f"/api/v1/games/{saved['id']}").json()["all_in"] is True
    assert client.get(f"/api/v1/games/{saved['id']}/sheet").json()["all_in"] is True

    updated = _save(client, _sheet([], id=saved["id"], all_in=False))
    assert updated["all_in"] is False


def test_a_sheet_without_all_in_is_not_all_in(client: TestClient) -> None:
    # all_in を足す前のフロント(入力の途中のキャッシュ)は送ってこない
    assert _save(client, _sheet([]))["all_in"] is False


def test_a_sheet_without_a_field_keeps_what_the_game_has(client: TestClient) -> None:
    # 欄を足す前のフロントが既存のゲームを保存しても、送らない欄を既定値で上書きしない
    saved = _save(
        client,
        _sheet(
            [],
            all_in=True,
            backfilled=True,
            arrow_diameter_mm=8,
            bow_type="compound",
        ),
    )
    sheet = _sheet([], id=saved["id"])
    for field in ("all_in", "backfilled", "arrow_diameter_mm", "bow_type"):
        sheet.pop(field, None)

    updated = _save(client, sheet)

    assert updated["all_in"] is True
    assert updated["backfilled"] is True
    assert updated["arrow_diameter_mm"] == 8
    assert updated["bow_type"] == "compound"


def test_a_sheet_can_clear_an_optional_field(client: TestClient) -> None:
    saved = _save(client, _sheet([], arrow_diameter_mm=8, bow_type="compound"))

    updated = _save(client, _sheet([], id=saved["id"], arrow_diameter_mm=None, bow_type=None))

    assert updated["arrow_diameter_mm"] is None
    assert updated["bow_type"] is None


def test_all_in_cannot_be_null(client: TestClient, current_user, factories) -> None:
    game = factories.GameFactory(user=current_user, all_in=True)

    assert client.put(SHEET_URL, json=_sheet([], all_in=None)).status_code == 422
    assert client.patch(f"/api/v1/games/{game.id}", json={"all_in": None}).status_code == 422
    # 送らなければ変えない
    patched = client.patch(f"/api/v1/games/{game.id}", json={"bow_type": "compound"})
    assert patched.status_code == 200
    assert patched.json()["all_in"] is True


def test_backfilled_is_kept_per_game(client: TestClient) -> None:
    saved = _save(client, _sheet([], recorded_at="2026-09-01", backfilled=True))

    assert saved["backfilled"] is True
    assert saved["recorded_at"] == "2026-09-01"
    assert client.get(f"/api/v1/games/{saved['id']}").json()["backfilled"] is True
    assert client.get(f"/api/v1/games/{saved['id']}/sheet").json()["backfilled"] is True

    updated = _save(client, _sheet([], id=saved["id"], backfilled=False))
    assert updated["backfilled"] is False


def test_a_sheet_without_backfilled_is_not_backfilled(client: TestClient) -> None:
    # backfilled を足す前のフロント(入力の途中のキャッシュ)は送ってこない
    assert _save(client, _sheet([]))["backfilled"] is False


def test_backfilled_cannot_be_null(client: TestClient, current_user, factories) -> None:
    game = factories.GameFactory(user=current_user, backfilled=True)

    assert client.put(SHEET_URL, json=_sheet([], backfilled=None)).status_code == 422
    assert client.patch(f"/api/v1/games/{game.id}", json={"backfilled": None}).status_code == 422
    patched = client.patch(f"/api/v1/games/{game.id}", json={"bow_type": "compound"})
    assert patched.status_code == 200
    assert patched.json()["backfilled"] is True


@contextmanager
def _count_selects(s: Session) -> Generator[list[str]]:
    selects: list[str] = []

    def _record(conn, cursor, statement: str, *_: object) -> None:
        if statement.lstrip().upper().startswith("SELECT"):
            selects.append(statement)

    connection = s.connection()
    event.listen(connection, "before_cursor_execute", _record)
    try:
        yield selects
    finally:
        event.remove(connection, "before_cursor_execute", _record)


def _two_rounds() -> list[dict]:
    return [
        _round(
            n,
            [
                _end(
                    e,
                    [_point(p, 10) for p in range(1, 4)],
                    comment=f"end {n}-{e}",
                )
                for e in range(1, 4)
            ],
            comment=f"round {n}",
        )
        for n in (1, 2)
    ]


def test_reading_a_sheet_does_not_query_per_round_end_or_point(
    client: TestClient, s: Session
) -> None:
    saved = _save(client, _sheet(_two_rounds(), comment="game"))

    with _count_selects(s) as selects:
        response = client.get(f"/api/v1/games/{saved['id']}/sheet")

    assert response.json() == saved
    # 本人の行(get_me)と、記録を丸ごと引く 1 回だけ
    assert len(selects) == 2, selects


def test_writing_a_sheet_does_not_query_per_round_end_or_point(
    client: TestClient, s: Session
) -> None:
    saved = _save(client, _sheet(_two_rounds(), comment="game"))
    sheet = {**saved, "rounds": [*saved["rounds"], *_two_rounds()]}

    with _count_selects(s) as selects:
        updated = _save(client, sheet)

    assert len(updated["rounds"]) == 4
    # 本人の行・書く前の記録・書いたあとの記録の 3 回だけ
    assert len(selects) == 3, selects


def test_the_sheet_is_ordered_by_number_then_id(
    client: TestClient, factories, current_user
) -> None:
    game = factories.GameFactory(user=current_user)
    second = factories.RoundFactory(game=game, number=2)
    first = factories.RoundFactory(game=game, number=1)
    tie = factories.RoundFactory(game=game, number=1)
    late_end = factories.EndFactory(round=first, number=2)
    early_end = factories.EndFactory(round=first, number=1)
    late_point = factories.PointFactory(end=early_end, number=2)
    early_point = factories.PointFactory(end=early_end, number=1)

    sheet = client.get(f"/api/v1/games/{game.id}/sheet").json()

    assert [r["id"] for r in sheet["rounds"]] == [first.id, tie.id, second.id]
    assert [e["id"] for e in sheet["rounds"][0]["ends"]] == [early_end.id, late_end.id]
    assert [p["id"] for p in sheet["rounds"][0]["ends"][0]["points"]] == [
        early_point.id,
        late_point.id,
    ]


def test_the_sheet_leaves_out_rounds_in_the_trash(
    client: TestClient, factories, current_user
) -> None:
    game = factories.GameFactory(user=current_user)
    kept = factories.RoundFactory(game=game)
    trashed = factories.RoundFactory(game=game)
    factories.PointFactory(end=factories.EndFactory(round=trashed))
    client.delete(f"/api/v1/rounds/{trashed.id}")

    sheet = client.get(f"/api/v1/games/{game.id}/sheet").json()

    assert [r["id"] for r in sheet["rounds"]] == [kept.id]


def test_a_sheet_explains_why_a_target_type_is_rejected(client: TestClient) -> None:
    target_type = client.put(SHEET_URL, json=_sheet([_round(1, [], target_type="60cm-old")]))

    assert target_type.json() == {"detail": TARGET_TYPE_ERROR}


def test_a_new_sheet_racing_another_with_the_same_client_key_saves_into_the_winner(
    client: TestClient,
    s: Session,
    factories,
    current_user,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 並んで届いた先の要求が、こちらが探したあと・作る前に同じキーのゲームを入れた
    winner = factories.GameFactory(user=current_user, client_key="key-1")
    monkeypatch.setattr(game_crud, "get_game_sheet_by_client_key", lambda *_: None)

    saved = _save(client, _sheet([_round(1, [_end(1, [_point(1, 10)])])]))

    assert saved["id"] == winner.id
    games = s.scalars(select(Game).where(Game.user_id == current_user.id)).all()
    assert [game.id for game in games] == [winner.id]
    assert [point["score"] for point in saved["rounds"][0]["ends"][0]["points"]] == [10]


def test_a_sheet_without_a_client_key_creates_a_new_game_each_time(client: TestClient) -> None:
    first = _save(client, _sheet([], client_key=None))
    second = _save(client, _sheet([], client_key=None))

    assert first["client_key"] is None
    assert second["id"] != first["id"]


def test_a_sheet_cannot_point_at_an_end_or_point_outside_the_game(client: TestClient) -> None:
    saved = _save(client, _sheet([_round(1, [_end(1, [_point(1, 10)])])]))
    round_ = saved["rounds"][0]
    end = round_["ends"][0]

    missing_end = _sheet(
        [_round(1, [_end(1, [], id=999_999_999)], id=round_["id"])],
        id=saved["id"],
    )
    missing_point = _sheet(
        [_round(1, [_end(1, [_point(1, 9, id=999_999_999)], id=end["id"])], id=round_["id"])],
        id=saved["id"],
    )

    assert client.put(SHEET_URL, json=missing_end).json() == {"detail": "End not found"}
    assert client.put(SHEET_URL, json=missing_point).json() == {"detail": "Point not found"}


def test_changing_the_target_type_of_a_round_checks_the_new_one(client: TestClient) -> None:
    saved = _save(client, _sheet([_round(1, [])]))
    round_id = saved["rounds"][0]["id"]

    rejected = client.put(
        SHEET_URL,
        json=_sheet([_round(1, [], id=round_id, target_type="60cm-old")], id=saved["id"]),
    )
    changed = _save(
        client,
        _sheet([_round(1, [], id=round_id, target_type="40cm")], id=saved["id"]),
    )

    assert rejected.status_code == 422
    assert changed["rounds"][0]["target_type"] == "40cm"
