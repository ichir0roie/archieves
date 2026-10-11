from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.support import ANNOUNCEMENT_LIMIT
from app.db import Announcement, ErrorReport, Feedback, User
from app.schemas.support import ErrorReportCreate


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


def list_all_feedbacks(s: Session) -> list[tuple[Feedback, User]]:
    """全員の意見を、送った利用者と組にして新しい順に返す。"""
    stmt = (
        select(Feedback, User)
        .join(User, Feedback.user_id == User.id)
        .where(Feedback.deleted_at.is_(None))
        .order_by(Feedback.created_at.desc(), Feedback.id.desc())
    )
    return [(feedback, user) for feedback, user in s.execute(stmt)]


def get_feedback_with_user(s: Session, feedback_id: int) -> tuple[Feedback, User] | None:
    stmt = (
        select(Feedback, User)
        .join(User, Feedback.user_id == User.id)
        .where(Feedback.id == feedback_id, Feedback.deleted_at.is_(None))
    )
    row = s.execute(stmt).first()
    return None if row is None else (row[0], row[1])


def reply_to_feedback(s: Session, feedback: Feedback, reply: str) -> Feedback:
    """返信を書く。書き直したときは返信の日時も新しくする。"""
    feedback.reply = reply
    feedback.replied_at = func.now()
    s.flush()
    s.refresh(feedback)
    return feedback


def list_recent_announcements(s: Session) -> list[Announcement]:
    stmt = (
        select(Announcement)
        .where(Announcement.deleted_at.is_(None), Announcement.published_at <= func.now())
        .order_by(Announcement.published_at.desc(), Announcement.id.desc())
        .limit(ANNOUNCEMENT_LIMIT)
    )
    return list(s.scalars(stmt))


def create_error_report(
    s: Session, user_id: int | None, report_in: ErrorReportCreate
) -> ErrorReport:
    report = ErrorReport(user_id=user_id, **report_in.model_dump())
    s.add(report)
    s.flush()
    return report


def list_error_reports(s: Session) -> list[tuple[ErrorReport, User | None]]:
    """全員のエラーを、未対応を先に、新しい順に返す。"""
    stmt = (
        select(ErrorReport, User)
        .outerjoin(User, ErrorReport.user_id == User.id)
        .where(ErrorReport.deleted_at.is_(None))
        .order_by(
            ErrorReport.resolved_at.is_not(None),
            ErrorReport.created_at.desc(),
            ErrorReport.id.desc(),
        )
    )
    return [(report, user) for report, user in s.execute(stmt)]


def get_error_report_with_user(
    s: Session, error_report_id: int
) -> tuple[ErrorReport, User | None] | None:
    stmt = (
        select(ErrorReport, User)
        .outerjoin(User, ErrorReport.user_id == User.id)
        .where(ErrorReport.id == error_report_id, ErrorReport.deleted_at.is_(None))
    )
    row = s.execute(stmt).first()
    return None if row is None else (row[0], row[1])


def resolve_error_report(s: Session, report: ErrorReport) -> ErrorReport:
    """対応済みにする。対応済みのものをもう一度押しても、最初の日時のまま残す。"""
    if report.resolved_at is None:
        report.resolved_at = func.now()
        s.flush()
        s.refresh(report)
    return report


def count_unanswered_feedbacks(s: Session) -> int:
    stmt = select(func.count()).where(Feedback.reply.is_(None), Feedback.deleted_at.is_(None))
    return s.scalar(stmt) or 0


def count_unresolved_error_reports(s: Session) -> int:
    stmt = select(func.count()).where(
        ErrorReport.resolved_at.is_(None), ErrorReport.deleted_at.is_(None)
    )
    return s.scalar(stmt) or 0
