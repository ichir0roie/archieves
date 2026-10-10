from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.support import ANNOUNCEMENT_LIMIT, MAX_FEEDBACK_LENGTH
from app.db import Game


def test_create_feedback_keeps_the_given_email(client: TestClient, current_user) -> None:
    response = client.post(
        "/api/v1/feedbacks", json={"body": "こうしてほしい", "email": "me@example.com"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user_id"] == current_user.id
    assert body["email"] == "me@example.com"
    assert body["body"] == "こうしてほしい"
    assert body["created_at"] is not None
    assert body["reply"] is None
    assert body["replied_at"] is None


def test_create_feedback_falls_back_to_the_token_email(client: TestClient) -> None:
    response = client.post("/api/v1/feedbacks", json={"body": "x"})

    assert response.status_code == 201
    assert response.json()["email"] == "test@example.com"


def test_create_feedback_rejects_empty_and_too_long_bodies(client: TestClient) -> None:
    assert client.post("/api/v1/feedbacks", json={"body": ""}).status_code == 422
    too_long = "a" * (MAX_FEEDBACK_LENGTH + 1)
    assert client.post("/api/v1/feedbacks", json={"body": too_long}).status_code == 422


def test_create_feedback_needs_a_registered_user(unregistered_client: TestClient) -> None:
    assert unregistered_client.post("/api/v1/feedbacks", json={"body": "x"}).status_code == 404


def test_list_feedbacks_returns_replies_newest_first(
    client: TestClient, current_user, factories
) -> None:
    replied_at = datetime(2026, 10, 1, tzinfo=UTC)
    older = factories.FeedbackFactory(
        user=current_user, reply="対応しました", replied_at=replied_at
    )
    newer = factories.FeedbackFactory(user=current_user)
    factories.FeedbackFactory(user=current_user, deleted_at=datetime(2026, 1, 1).date())

    response = client.get("/api/v1/feedbacks")

    assert response.status_code == 200
    rows = response.json()
    # 同じトランザクションの中では created_at が同じなので、id で並ぶ
    assert [r["id"] for r in rows] == [newer.id, older.id]
    assert rows[1]["reply"] == "対応しました"
    assert datetime.fromisoformat(rows[1]["replied_at"]) == replied_at


def test_list_announcements_returns_the_latest_published_ones(
    client: TestClient, factories
) -> None:
    now = datetime.now(UTC)
    published = [
        factories.AnnouncementFactory(published_at=now - timedelta(days=i + 1))
        for i in range(ANNOUNCEMENT_LIMIT + 2)
    ]
    factories.AnnouncementFactory(published_at=now + timedelta(days=1))
    factories.AnnouncementFactory(published_at=now - timedelta(days=1), deleted_at=now.date())

    response = client.get("/api/v1/announcements")

    assert response.status_code == 200
    ids = [a["id"] for a in response.json()]
    assert ids == [a.id for a in published[:ANNOUNCEMENT_LIMIT]]


def test_updated_at_is_set_by_the_database_on_update(s: Session, factories) -> None:
    game = factories.GameFactory()
    long_ago = datetime(2000, 1, 1, tzinfo=UTC)

    # 値を渡しても、トリガーが db の時計で書き換える
    s.execute(update(Game).where(Game.id == game.id).values(updated_at=long_ago))
    s.refresh(game)
    assert game.updated_at != long_ago

    # ORM の更新のあとも、トリガーが書いた値を読み直す
    game.game_size = 3
    s.flush()
    assert game.updated_at == s.scalar(select(func.now()))
