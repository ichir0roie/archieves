"""AI(Claude Code など)が本人のトークンで書く、ゲームへの指摘・改善点と、そのために読む記録。"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.comments import MAX_AI_COMMENT_LENGTH
from app.core.errors import AI_COMMENT_NEEDS_ACCESS_TOKEN
from app.db import GameAiComment


def test_a_token_writes_an_ai_comment_shown_at_the_end_of_the_sheet(
    token_client: TestClient, current_user, factories
) -> None:
    game = factories.GameFactory(user=current_user)

    response = token_client.put(
        f"/api/v1/games/{game.id}/ai-comment",
        json={"body": "後半のエンドで右上に散っています。"},
    )

    assert response.status_code == 200
    written = response.json()
    assert written["game_id"] == game.id
    assert written["body"] == "後半のエンドで右上に散っています。"
    # 書いたトークンの名前(conftest の access_token は「Claude Code」)
    assert written["author"] == "Claude Code"

    sheet = token_client.get(f"/api/v1/games/{game.id}/sheet").json()
    assert sheet["ai_comment"] == written


def test_writing_again_overwrites_the_ai_comment(
    token_client: TestClient, s: Session, current_user, factories
) -> None:
    game = factories.GameFactory(user=current_user)

    token_client.put(f"/api/v1/games/{game.id}/ai-comment", json={"body": "一回目"})
    response = token_client.put(f"/api/v1/games/{game.id}/ai-comment", json={"body": "二回目"})

    assert response.json()["body"] == "二回目"
    rows = s.scalars(select(GameAiComment).where(GameAiComment.game_id == game.id)).all()
    assert [row.body for row in rows] == ["二回目"]


def test_a_sheet_without_an_ai_comment_has_null(
    client: TestClient, current_user, factories
) -> None:
    game = factories.GameFactory(user=current_user)

    assert client.get(f"/api/v1/games/{game.id}/sheet").json()["ai_comment"] is None


def test_an_ai_comment_cannot_be_written_from_a_browser_sign_in(
    client: TestClient, current_user, factories
) -> None:
    game = factories.GameFactory(user=current_user)

    response = client.put(f"/api/v1/games/{game.id}/ai-comment", json={"body": "x"})

    assert response.status_code == 403
    assert response.json() == {"detail": AI_COMMENT_NEEDS_ACCESS_TOKEN}


def test_an_ai_comment_cannot_be_written_on_another_users_game(
    token_client: TestClient, factories
) -> None:
    game = factories.GameFactory()

    response = token_client.put(f"/api/v1/games/{game.id}/ai-comment", json={"body": "x"})

    assert response.status_code == 403


def test_an_ai_comment_on_a_missing_or_deleted_game_is_not_found(
    token_client: TestClient, current_user, factories
) -> None:
    deleted = factories.GameFactory(user=current_user, deleted_at=date(2026, 1, 2))

    for game_id in (deleted.id, 999999999):
        response = token_client.put(f"/api/v1/games/{game_id}/ai-comment", json={"body": "x"})
        assert response.status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        "",
        "x" * (MAX_AI_COMMENT_LENGTH + 1),
    ],
)
def test_an_ai_comment_rejects_an_empty_or_too_long_body(
    token_client: TestClient, current_user, factories, body: str
) -> None:
    game = factories.GameFactory(user=current_user)

    response = token_client.put(f"/api/v1/games/{game.id}/ai-comment", json={"body": body})

    assert response.status_code == 422


def test_i_delete_an_ai_comment_from_the_screen(
    client: TestClient, s: Session, current_user, factories
) -> None:
    game = factories.GameFactory(user=current_user)
    s.add(GameAiComment(game_id=game.id, user_id=current_user.id, body="x", author="Claude Code"))
    s.flush()

    assert client.delete(f"/api/v1/games/{game.id}/ai-comment").status_code == 204
    assert client.get(f"/api/v1/games/{game.id}/sheet").json()["ai_comment"] is None
    assert client.delete(f"/api/v1/games/{game.id}/ai-comment").status_code == 404


def test_i_cannot_delete_another_users_ai_comment(
    client: TestClient, s: Session, factories
) -> None:
    game = factories.GameFactory()
    s.add(GameAiComment(game_id=game.id, user_id=game.user_id, body="x", author="Claude Code"))
    s.flush()

    assert client.delete(f"/api/v1/games/{game.id}/ai-comment").status_code == 403


def test_ai_comments_are_not_on_the_public_score_page(
    anonymous_client: TestClient, s: Session, factories
) -> None:
    game = factories.GameFactory(user=factories.UserFactory(score_visibility="public"))
    s.add(GameAiComment(game_id=game.id, user_id=game.user_id, body="x", author="Claude Code"))
    s.flush()

    shared = anonymous_client.get("/api/v1/public/scores", params={"game_ids": [game.id]}).json()

    assert [g["id"] for g in shared] == [game.id]
    assert "ai_comment" not in shared[0]


def _sheet_ids(client: TestClient, **params: object) -> list[int]:
    response = client.get("/api/v1/games/sheets", params=params)
    assert response.status_code == 200
    return [sheet["id"] for sheet in response.json()]


def test_game_sheets_are_mine_newest_first(
    token_client: TestClient, current_user, factories
) -> None:
    old = factories.GameFactory(user=current_user, recorded_at=date(2026, 1, 1))
    new = factories.GameFactory(user=current_user, recorded_at=date(2026, 3, 1))
    same_day_later = factories.GameFactory(user=current_user, recorded_at=date(2026, 3, 1))
    factories.GameFactory(
        user=current_user,
        recorded_at=date(2026, 4, 1),
        deleted_at=date(2026, 4, 2),
    )
    factories.GameFactory(recorded_at=date(2026, 5, 1))

    assert _sheet_ids(token_client) == [same_day_later.id, new.id, old.id]


def test_game_sheets_hold_the_whole_record(
    token_client: TestClient, current_user, factories
) -> None:
    point = factories.PointFactory(end__round__game__user=current_user, score=9)
    factories.GameCommentFactory(game=point.end.round.game, body="風が強い")

    sheet = token_client.get("/api/v1/games/sheets").json()[0]

    assert sheet["comment"] == "風が強い"
    assert sheet["rounds"][0]["ends"][0]["points"][0]["score"] == 9


def test_game_sheets_of_a_day_and_up_to_a_day(
    token_client: TestClient, current_user, factories
) -> None:
    before = [
        factories.GameFactory(user=current_user, recorded_at=date(2026, 2, day))
        for day in range(1, 6)
    ]
    today = factories.GameFactory(user=current_user, recorded_at=date(2026, 2, 10))
    factories.GameFactory(user=current_user, recorded_at=date(2026, 2, 11))

    assert _sheet_ids(token_client, recorded_on="2026-02-10") == [today.id]
    assert _sheet_ids(token_client, until="2026-02-10", limit=3) == [
        today.id,
        before[4].id,
        before[3].id,
    ]


@pytest.mark.parametrize("limit", [0, 101])
def test_game_sheets_reject_a_limit_out_of_range(token_client: TestClient, limit: int) -> None:
    assert token_client.get("/api/v1/games/sheets", params={"limit": limit}).status_code == 422
