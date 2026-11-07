from collections.abc import Generator
from contextlib import contextmanager
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.match_codes import MATCH_ID_ALPHABET, MATCH_ID_LENGTH
from app.core.matches import MATCH_DESCRIPTION_MAX_LENGTH, MATCH_TITLE_MAX_LENGTH
from app.core.scoring import X_SCORE
from app.db import Game

MATCHES_URL = "/api/v1/matches"

SETTINGS = {
    "game_size": 2,
    "round_size": 6,
    "end_size": 3,
}


def _game_with_scores(
    factories, match, user, scores: list[int], distance_m: int = 70, **fields
) -> Game:
    game = factories.GameFactory(user=user, match=match, **fields)
    round_ = factories.RoundFactory(game=game, distance_m=distance_m)
    end = factories.EndFactory(round=round_)
    for number, score in enumerate(scores, start=1):
        factories.PointFactory(end=end, number=number, score=score)
    return game


def test_create_a_match_with_the_arrow_counts(client: TestClient, current_user) -> None:
    response = client.post(MATCHES_URL, json={**SETTINGS, "held_at": "2026-11-07T10:00:00+09:00"})

    assert response.status_code == 201
    body = response.json()
    assert {key: body[key] for key in SETTINGS} == SETTINGS
    assert len(body["id"]) == MATCH_ID_LENGTH
    assert set(body["id"]) <= set(MATCH_ID_ALPHABET)
    assert datetime.fromisoformat(body["held_at"]) == datetime(2026, 11, 7, 1, tzinfo=UTC)
    assert body["organizer"] == {
        "id": current_user.id,
        "name": current_user.name,
        "profile_visible": True,
    }
    assert body["game_count"] == 0


def test_a_match_has_a_title_and_a_description(client: TestClient) -> None:
    response = client.post(
        MATCHES_URL,
        json={**SETTINGS, "title": "  秋の記録会  ", "description": "70m の部と 30m の部"},
    )

    assert response.status_code == 201
    assert response.json()["title"] == "秋の記録会"
    assert response.json()["description"] == "70m の部と 30m の部"


def test_a_blank_title_is_no_title(client: TestClient) -> None:
    body = client.post(MATCHES_URL, json={**SETTINGS, "title": "   ", "description": ""}).json()

    assert body["title"] is None
    assert body["description"] is None


@pytest.mark.parametrize(
    ("field", "length"),
    [
        ("title", MATCH_TITLE_MAX_LENGTH + 1),
        ("description", MATCH_DESCRIPTION_MAX_LENGTH + 1),
    ],
)
def test_too_long_texts_are_rejected(client: TestClient, field: str, length: int) -> None:
    response = client.post(MATCHES_URL, json={**SETTINGS, field: "あ" * length})

    assert response.status_code == 422


def test_the_organizer_edits_the_title_and_description(
    client: TestClient, current_user, factories
) -> None:
    match = factories.MatchFactory(organizer=current_user, title="前", description="説明")

    retitled = client.patch(f"{MATCHES_URL}/{match.id}", json={"title": "後"})
    cleared = client.patch(f"{MATCHES_URL}/{match.id}", json={"description": None})

    assert retitled.status_code == 200
    assert (retitled.json()["title"], retitled.json()["description"]) == ("後", "説明")
    assert (cleared.json()["title"], cleared.json()["description"]) == ("後", None)


def test_only_the_organizer_edits_a_match(client: TestClient, factories) -> None:
    match = factories.MatchFactory(title="前")

    response = client.patch(f"{MATCHES_URL}/{match.id}", json={"title": "後"})

    assert response.status_code == 403
    assert client.get(f"{MATCHES_URL}/{match.id}").json()["title"] == "前"


def test_editing_a_missing_match_is_404(client: TestClient) -> None:
    assert client.patch(f"{MATCHES_URL}/NOSUCHID", json={"title": "後"}).status_code == 404


def test_a_match_tells_whether_i_made_or_played_it(
    client: TestClient, current_user, factories
) -> None:
    made = factories.MatchFactory(organizer=current_user)
    played = factories.MatchFactory()
    _game_with_scores(factories, played, current_user, [10])
    factories.GameFactory(user=current_user, match=played)
    factories.GameFactory(user=current_user, match=played, deleted_at=datetime.now(UTC).date())

    made_body = client.get(f"{MATCHES_URL}/{made.id}").json()
    played_body = client.get(f"{MATCHES_URL}/{played.id}").json()

    assert (made_body["organized_by_me"], made_body["my_game_count"]) == (True, 0)
    assert (played_body["organized_by_me"], played_body["my_game_count"]) == (False, 2)


def test_the_organizer_deletes_a_match_and_its_games_stay_as_plain_games(
    client: TestClient, s: Session, current_user, factories
) -> None:
    match = factories.MatchFactory(organizer=current_user)
    game = _game_with_scores(factories, match, factories.UserFactory(), [10])

    response = client.delete(f"{MATCHES_URL}/{match.id}")

    assert response.status_code == 204
    assert client.get(f"{MATCHES_URL}/{match.id}").status_code == 404
    assert client.get(MATCHES_URL).json() == []
    s.refresh(game)
    assert game.deleted_at is None
    assert game.match_id is None


def test_only_the_organizer_deletes_a_match(client: TestClient, current_user, factories) -> None:
    match = factories.MatchFactory()
    _game_with_scores(factories, match, current_user, [10])

    response = client.delete(f"{MATCHES_URL}/{match.id}")

    assert response.status_code == 403
    assert client.get(f"{MATCHES_URL}/{match.id}").status_code == 200


def test_deleting_a_missing_match_is_404(client: TestClient, factories) -> None:
    match = factories.MatchFactory(deleted_at=datetime.now(UTC).date())

    assert client.delete(f"{MATCHES_URL}/{match.id}").status_code == 404
    assert client.delete(f"{MATCHES_URL}/NOSUCHID").status_code == 404


def test_a_sheet_for_a_deleted_match_is_saved_without_the_match(
    client: TestClient, factories
) -> None:
    # 入力の途中に試合が消えても、手元の記録は保存できる
    match = factories.MatchFactory(deleted_at=datetime.now(UTC).date())

    response = client.put(
        "/api/v1/games/sheet",
        json={"recorded_at": "2026-11-07", "match_id": match.id},
    )

    assert response.status_code == 200
    assert response.json()["match_id"] is None


def test_each_match_gets_its_own_code(client: TestClient) -> None:
    ids = {client.post(MATCHES_URL, json=SETTINGS).json()["id"] for _ in range(3)}

    assert len(ids) == 3


def test_a_match_is_held_now_when_the_time_is_omitted(client: TestClient) -> None:
    before = datetime.now(UTC)

    response = client.post(MATCHES_URL, json=SETTINGS)

    assert response.status_code == 201
    held_at = datetime.fromisoformat(response.json()["held_at"])
    assert before <= held_at <= datetime.now(UTC)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("game_size", 0),
        ("round_size", 101),
        ("end_size", 0),
    ],
)
def test_out_of_range_settings_are_rejected(client: TestClient, field: str, value) -> None:
    response = client.post(MATCHES_URL, json={**SETTINGS, field: value})

    assert response.status_code == 422


def test_anyone_signed_in_reads_a_match_by_its_id(client: TestClient, factories) -> None:
    match = factories.MatchFactory()

    response = client.get(f"{MATCHES_URL}/{match.id}")

    assert response.status_code == 200
    assert response.json()["id"] == match.id
    assert response.json()["organizer"]["id"] == match.organizer_id


def test_a_missing_match_is_404(client: TestClient, factories) -> None:
    match = factories.MatchFactory(deleted_at=datetime.now(UTC).date())

    assert client.get(f"{MATCHES_URL}/{match.id}").status_code == 404
    assert client.get(f"{MATCHES_URL}/NOSUCHID").status_code == 404


def test_a_match_whose_organizer_is_gone_has_no_organizer(
    client: TestClient, s: Session, factories
) -> None:
    match = factories.MatchFactory(organizer=None)

    response = client.get(f"{MATCHES_URL}/{match.id}")

    assert response.status_code == 200
    assert response.json()["organizer"] is None


def test_my_matches_are_the_ones_i_made_or_played(
    client: TestClient, current_user, factories
) -> None:
    made = factories.MatchFactory(
        organizer=current_user,
        held_at=datetime(2026, 11, 1, tzinfo=UTC),
    )
    played = factories.MatchFactory(held_at=datetime(2026, 11, 5, tzinfo=UTC))
    _game_with_scores(factories, played, current_user, [10])
    left = factories.MatchFactory()
    _game_with_scores(factories, left, current_user, [10], deleted_at=datetime.now(UTC).date())
    others = factories.MatchFactory()
    _game_with_scores(factories, others, factories.UserFactory(), [10])

    response = client.get(MATCHES_URL)

    assert response.status_code == 200
    assert [match["id"] for match in response.json()] == [played.id, made.id]
    assert response.json()[0]["game_count"] == 1


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


def test_listing_matches_does_not_read_once_per_match(
    client: TestClient, s: Session, current_user, factories
) -> None:
    def make_match() -> None:
        match = factories.MatchFactory(organizer=factories.UserFactory())
        _game_with_scores(factories, match, current_user, [10, 9])

    make_match()
    with _count_selects(s) as one:
        assert len(client.get(MATCHES_URL).json()) == 1
    for _ in range(4):
        make_match()
    with _count_selects(s) as five:
        assert len(client.get(MATCHES_URL).json()) == 5

    assert len(five) == len(one)


def test_a_saved_sheet_joins_the_match(client: TestClient, s: Session, factories) -> None:
    match = factories.MatchFactory()

    response = client.put(
        "/api/v1/games/sheet",
        json={"recorded_at": "2026-11-07", "match_id": match.id},
    )

    assert response.status_code == 200
    assert response.json()["match_id"] == match.id
    game = s.get_one(Game, response.json()["id"])
    assert game.match_id == match.id
    assert client.get(f"/api/v1/games/{game.id}").json()["match_id"] == match.id


def test_saving_without_the_match_keeps_it_and_null_leaves_it(
    client: TestClient, current_user, factories
) -> None:
    match = factories.MatchFactory()
    game = factories.GameFactory(user=current_user, match=match)

    kept = client.put("/api/v1/games/sheet", json={"id": game.id, "recorded_at": "2026-11-07"})
    left = client.put(
        "/api/v1/games/sheet",
        json={"id": game.id, "recorded_at": "2026-11-07", "match_id": None},
    )

    assert kept.json()["match_id"] == match.id
    assert left.json()["match_id"] is None


def test_a_sheet_cannot_join_a_match_that_never_existed(client: TestClient) -> None:
    response = client.put(
        "/api/v1/games/sheet",
        json={"recorded_at": "2026-11-07", "match_id": "NOSUCHID"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Match not found"}


def test_the_result_ranks_every_game_with_its_deviation_score(
    client: TestClient, current_user, factories
) -> None:
    match = factories.MatchFactory(organizer=current_user)
    alice = factories.UserFactory(name="Alice")
    bob = factories.UserFactory(name="Bob")
    carol = factories.UserFactory(name="Carol")
    dave = factories.UserFactory(name="Dave")
    # 3 人が 29 点で並ぶ。10 点(X を含む)の本数、X の本数の多い順にする
    # 弓・距離は人ごとに違ってよく、まとめて順位を付ける
    dave_game = _game_with_scores(factories, match, dave, [9, 9, X_SCORE, 1], bow_type="compound")
    alice_game = _game_with_scores(factories, match, alice, [10, 10, 9], bow_type="recurve")
    bob_game = _game_with_scores(
        factories, match, bob, [X_SCORE, 9, 10], distance_m=30, bow_type="barebow"
    )
    carol_game = _game_with_scores(factories, match, carol, [5, 5, 0], bow_type=None)
    # 矢の無いゲームと消したゲームは数えない
    factories.GameFactory(user=factories.UserFactory(), match=match)
    _game_with_scores(
        factories, match, factories.UserFactory(), [10], deleted_at=datetime.now(UTC).date()
    )
    # ほかの試合のゲームも数えない
    _game_with_scores(factories, factories.MatchFactory(), alice, [10])

    response = client.get(f"{MATCHES_URL}/{match.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == match.id
    assert body["game_count"] == 4
    entries = body["result"]["entries"]
    assert [(e["rank"], e["game_id"], e["user"]["name"], e["total_score"]) for e in entries] == [
        (1, bob_game.id, "Bob", 29),
        (2, alice_game.id, "Alice", 29),
        (3, dave_game.id, "Dave", 29),
        (4, carol_game.id, "Carol", 10),
    ]
    assert [(e["x_count"], e["ten_count"], e["miss_count"]) for e in entries] == [
        (1, 1, 0),
        (0, 2, 0),
        (1, 0, 0),
        (0, 0, 1),
    ]
    assert [(e["bow_type"], e["distance_m"]) for e in entries] == [
        ("barebow", 30),
        ("recurve", 70),
        ("compound", 70),
        (None, 70),
    ]
    assert [e["arrow_count"] for e in entries] == [3, 3, 4, 3]
    assert entries[3]["point_average"] == pytest.approx(10 / 3)
    # 合計点は 29・29・29・10。平均 97/4、母標準偏差 sqrt(1083/16)
    average = 97 / 4
    standard_deviation = (1083 / 16) ** 0.5
    assert [e["deviation_score"] for e in entries] == pytest.approx(
        [50 + 10 * (total - average) / standard_deviation for total in [29, 29, 29, 10]]
    )
    statistics = body["result"]["statistics"]
    assert statistics["count"] == 4
    assert statistics["average"] == pytest.approx(average)
    assert statistics["standard_deviation"] == pytest.approx(standard_deviation)
    assert statistics["median"] == 29
    assert (statistics["max"], statistics["min"]) == (29, 10)


def test_equal_games_share_a_rank_and_the_middle_deviation(
    client: TestClient, current_user, factories
) -> None:
    match = factories.MatchFactory()
    mine = _game_with_scores(factories, match, current_user, [10, 9])
    theirs = _game_with_scores(factories, match, factories.UserFactory(), [10, 9])

    entries = client.get(f"{MATCHES_URL}/{match.id}").json()["result"]["entries"]

    assert [(e["rank"], e["game_id"]) for e in entries] == [(1, mine.id), (1, theirs.id)]
    assert {e["deviation_score"] for e in entries} == {50}


def test_a_match_without_games_has_an_empty_result(client: TestClient, current_user, factories):
    match = factories.MatchFactory(organizer=current_user)

    body = client.get(f"{MATCHES_URL}/{match.id}").json()["result"]

    assert body["entries"] == []
    assert body["statistics"] == {
        "count": 0,
        "average": None,
        "standard_deviation": None,
        "median": None,
        "max": None,
        "min": None,
    }


def test_only_the_organizer_and_participants_see_the_result(
    client: TestClient, current_user, factories
) -> None:
    match = factories.MatchFactory()
    _game_with_scores(factories, match, factories.UserFactory(), [10])
    _game_with_scores(factories, match, current_user, [10], deleted_at=datetime.now(UTC).date())

    response = client.get(f"{MATCHES_URL}/{match.id}")

    # 試合の設定は読めるが、他人の名前と点が出る結果は付かない
    assert response.status_code == 200
    assert response.json()["game_count"] == 1
    assert response.json()["result"] is None


def test_a_token_cannot_read_matches(token_client: TestClient, factories) -> None:
    match = factories.MatchFactory()

    assert token_client.get(f"{MATCHES_URL}/{match.id}").status_code == 403


def test_the_ranking_counts_only_the_matchs_games(anonymous_client: TestClient, factories) -> None:
    match = factories.MatchFactory()
    player = factories.UserFactory(ranking_visibility="public")
    _game_with_scores(factories, match, player, [10, 10])
    _game_with_scores(factories, None, player, [9])

    response = anonymous_client.get("/api/v1/public/ranking", params={"match_id": match.id})

    assert response.status_code == 200
    assert [(r["user"]["id"], r["value"]) for r in response.json()] == [(player.id, 20)]
