from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.support import ANNOUNCEMENT_LIMIT
from app.db import Announcement, Feedback


def create_feedback(s: Session, user_id: int, email: str | None, body: str) -> Feedback:
    feedback = Feedback(user_id=user_id, email=email, body=body)
    s.add(feedback)
    s.flush()
    s.refresh(feedback)
    return feedback


def list_feedbacks(s: Session, user_id: int) -> list[Feedback]:
    stmt = (
        select(Feedback)
        .where(Feedback.user_id == user_id, Feedback.deleted_at.is_(None))
        .order_by(Feedback.created_at.desc(), Feedback.id.desc())
    )
    return list(s.scalars(stmt))


def list_recent_announcements(s: Session) -> list[Announcement]:
    stmt = (
        select(Announcement)
        .where(Announcement.deleted_at.is_(None), Announcement.published_at <= func.now())
        .order_by(Announcement.published_at.desc(), Announcement.id.desc())
        .limit(ANNOUNCEMENT_LIMIT)
    )
    return list(s.scalars(stmt))
