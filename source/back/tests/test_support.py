from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.support import ANNOUNCEMENT_LIMIT, MAX_ERROR_MESSAGE_LENGTH, MAX_FEEDBACK_LENGTH
from app.db import ErrorReport, Game


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


def test_admin_feedbacks_list_everyones_feedbacks_with_the_sender(
    client: TestClient, s: Session, current_user, factories
) -> None:
    current_user.is_admin = True
    s.flush()
    other = factories.UserFactory(name="Taro", nickname="たろう")
    older = factories.FeedbackFactory(user=other, body="他人の意見")
    newer = factories.FeedbackFactory(user=current_user)
    factories.FeedbackFactory(user=other, deleted_at=datetime(2026, 1, 1).date())

    response = client.get("/api/v1/admin/feedbacks")

    assert response.status_code == 200
    rows = response.json()
    # 同じトランザクションの中では created_at が同じなので、id で並ぶ
    assert [r["id"] for r in rows] == [newer.id, older.id]
    assert rows[1]["user_id"] == other.id
    assert rows[1]["user_name"] == "Taro"
    assert rows[1]["user_nickname"] == "たろう"
    assert rows[1]["body"] == "他人の意見"


def test_admin_can_reply_and_the_sender_sees_it(
    client: TestClient, s: Session, current_user, factories
) -> None:
    current_user.is_admin = True
    s.flush()
    other = factories.UserFactory(name="Taro")
    feedback = factories.FeedbackFactory(user=other)

    response = client.put(
        f"/api/v1/admin/feedbacks/{feedback.id}/reply", json={"reply": "直しました"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "直しました"
    assert body["replied_at"] is not None
    assert body["user_name"] == "Taro"
    s.refresh(feedback)
    assert feedback.reply == "直しました"
    assert feedback.replied_at is not None


def test_admin_reply_rejects_empty_and_missing_feedbacks(
    client: TestClient, s: Session, current_user, factories
) -> None:
    current_user.is_admin = True
    s.flush()
    feedback = factories.FeedbackFactory()
    deleted = factories.FeedbackFactory(deleted_at=datetime(2026, 1, 1).date())

    assert (
        client.put(f"/api/v1/admin/feedbacks/{feedback.id}/reply", json={"reply": ""}).status_code
        == 422
    )
    for feedback_id in [deleted.id, 0]:
        response = client.put(
            f"/api/v1/admin/feedbacks/{feedback_id}/reply", json={"reply": "x"}
        )
        assert response.status_code == 404


API_ERROR = {
    "kind": "api",
    "status_code": 500,
    "page_path": "/score-log",
    "method": "GET",
    "api_path": "/api/v1/games",
    "message": "Internal Server Error",
}


def test_an_error_report_is_stored_with_the_sender(
    client: TestClient, s: Session, current_user
) -> None:
    response = client.post("/api/v1/error-reports", json=API_ERROR)

    assert response.status_code == 204
    report = s.scalars(select(ErrorReport)).one()
    assert report.user_id == current_user.id
    assert report.kind == "api"
    assert report.status_code == 500
    assert report.page_path == "/score-log"
    assert report.api_path == "/api/v1/games"
    assert report.resolved_at is None


def test_a_missing_page_is_reported_without_the_api_fields(client: TestClient, s: Session) -> None:
    response = client.post(
        "/api/v1/error-reports",
        json={"kind": "page", "status_code": 404, "page_path": "/no-such-page"},
    )

    assert response.status_code == 204
    report = s.scalars(select(ErrorReport)).one()
    assert (report.kind, report.method, report.api_path) == ("page", None, None)


def test_an_error_report_is_accepted_before_registration(
    unregistered_client: TestClient, s: Session
) -> None:
    response = unregistered_client.post("/api/v1/error-reports", json=API_ERROR)

    assert response.status_code == 204
    assert s.scalars(select(ErrorReport)).one().user_id is None


def test_an_error_report_rejects_unknown_kinds_and_too_long_messages(client: TestClient) -> None:
    assert client.post("/api/v1/error-reports", json={**API_ERROR, "kind": "x"}).status_code == 422
    too_long = "x" * (MAX_ERROR_MESSAGE_LENGTH + 1)
    assert (
        client.post("/api/v1/error-reports", json={**API_ERROR, "message": too_long}).status_code
        == 422
    )
    assert (
        client.post("/api/v1/error-reports", json={**API_ERROR, "status_code": 99}).status_code
        == 422
    )


def test_admin_error_reports_list_unresolved_first_with_the_sender(
    client: TestClient, s: Session, current_user, factories
) -> None:
    current_user.is_admin = True
    s.flush()
    other = factories.UserFactory(name="Taro")
    resolved = factories.ErrorReportFactory(
        user=other,
        resolved_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    older = factories.ErrorReportFactory(user=other)
    newer = factories.ErrorReportFactory(user=None, kind="page", status_code=404)
    factories.ErrorReportFactory(deleted_at=datetime(2026, 1, 1).date())

    response = client.get("/api/v1/admin/error-reports")

    assert response.status_code == 200
    rows = response.json()
    assert [r["id"] for r in rows] == [newer.id, older.id, resolved.id]
    assert rows[0]["user_id"] is None
    assert rows[0]["user_name"] is None
    assert rows[1]["user_name"] == "Taro"
    assert rows[2]["resolved_at"] is not None


def test_admin_can_resolve_an_error_report_once(
    client: TestClient, s: Session, current_user, factories
) -> None:
    current_user.is_admin = True
    s.flush()
    report = factories.ErrorReportFactory()

    first = client.put(f"/api/v1/admin/error-reports/{report.id}/resolve")
    second = client.put(f"/api/v1/admin/error-reports/{report.id}/resolve")

    assert first.status_code == 200
    assert first.json()["resolved_at"] is not None
    # 二度押しても、最初に対応した日時のまま
    assert second.json()["resolved_at"] == first.json()["resolved_at"]


def test_admin_resolve_rejects_missing_error_reports(
    client: TestClient, s: Session, current_user, factories
) -> None:
    current_user.is_admin = True
    s.flush()
    deleted = factories.ErrorReportFactory(deleted_at=datetime(2026, 1, 1).date())

    for error_report_id in [deleted.id, 0]:
        assert (
            client.put(f"/api/v1/admin/error-reports/{error_report_id}/resolve").status_code
            == 404
        )


def test_admin_pending_counts_count_unanswered_feedbacks_and_unresolved_errors(
    client: TestClient, s: Session, current_user, factories
) -> None:
    current_user.is_admin = True
    s.flush()
    factories.FeedbackFactory.create_batch(2)
    factories.FeedbackFactory(reply="済み")
    factories.FeedbackFactory(deleted_at=datetime(2026, 1, 1).date())
    factories.ErrorReportFactory.create_batch(3)
    factories.ErrorReportFactory(resolved_at=datetime(2026, 1, 1, tzinfo=UTC))
    factories.ErrorReportFactory(deleted_at=datetime(2026, 1, 1).date())

    response = client.get("/api/v1/admin/pending-counts")

    assert response.status_code == 200
    assert response.json() == {"unanswered_feedbacks": 2, "unresolved_error_reports": 3}
