from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import support as support_crud
from app.crud import user as user_crud
from app.db import ErrorReport, Feedback, User
from app.schemas.support import (
    AdminErrorReportRead,
    AdminFeedbackRead,
    AdminPendingCounts,
    AnnouncementRead,
    ErrorReportCreate,
    FeedbackCreate,
    FeedbackRead,
    FeedbackReply,
)

router = APIRouter()


@router.post("/feedbacks", response_model=FeedbackRead, status_code=201)
def create_feedback(
    feedback_in: FeedbackCreate,
    me: User = Depends(deps.get_me),
    claims: deps.Claims = Depends(deps.get_browser_claims),
    s: Session = Depends(deps.get_session),
) -> FeedbackRead:
    email = feedback_in.email or claims.email
    result = support_crud.create_feedback(s, me.id, email, feedback_in.body)
    s.commit()
    return result


@router.get("/feedbacks", response_model=list[FeedbackRead])
def list_feedbacks(
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> list[FeedbackRead]:
    return support_crud.list_feedbacks(s, me.id)


def _to_admin_read(feedback: Feedback, user: User) -> AdminFeedbackRead:
    return AdminFeedbackRead(
        id=feedback.id,
        user_id=feedback.user_id,
        email=feedback.email,
        body=feedback.body,
        created_at=feedback.created_at,
        reply=feedback.reply,
        replied_at=feedback.replied_at,
        user_name=user.name,
        user_nickname=user.nickname,
    )


@router.get(
    "/admin/feedbacks",
    response_model=list[AdminFeedbackRead],
    dependencies=[Depends(deps.get_admin)],
)
def list_all_feedbacks(
    s: Session = Depends(deps.get_session),
) -> list[AdminFeedbackRead]:
    return [
        _to_admin_read(feedback, user)
        for feedback, user in support_crud.list_all_feedbacks(s)
    ]


@router.put(
    "/admin/feedbacks/{feedback_id}/reply",
    response_model=AdminFeedbackRead,
    dependencies=[Depends(deps.get_admin)],
)
def reply_to_feedback(
    feedback_id: int,
    reply_in: FeedbackReply,
    s: Session = Depends(deps.get_session),
) -> AdminFeedbackRead:
    feedback, user = deps.get_or_404(
        support_crud.get_feedback_with_user, s, feedback_id, detail="Feedback not found"
    )
    support_crud.reply_to_feedback(s, feedback, reply_in.reply)
    s.commit()
    return _to_admin_read(feedback, user)


@router.get(
    "/announcements",
    response_model=list[AnnouncementRead],
    dependencies=[Depends(deps.get_browser_claims)],
)
def list_announcements(
    s: Session = Depends(deps.get_session),
) -> list[AnnouncementRead]:
    return support_crud.list_recent_announcements(s)


@router.post("/error-reports", status_code=204)
def create_error_report(
    report_in: ErrorReportCreate,
    claims: deps.Claims = Depends(deps.get_browser_claims),
    s: Session = Depends(deps.get_session),
) -> Response:
    # 登録の前(利用者の行が無い)に起きたエラーも受けるので、get_me でなく sub から引く
    user = user_crud.get_user_by_sub(s, claims.sub)
    support_crud.create_error_report(s, None if user is None else user.id, report_in)
    s.commit()
    return Response(status_code=204)


def _to_admin_error_read(report: ErrorReport, user: User | None) -> AdminErrorReportRead:
    return AdminErrorReportRead(
        id=report.id,
        user_id=report.user_id,
        user_name=None if user is None else user.name,
        kind=report.kind,
        status_code=report.status_code,
        page_path=report.page_path,
        method=report.method,
        api_path=report.api_path,
        message=report.message,
        created_at=report.created_at,
        resolved_at=report.resolved_at,
    )


@router.get(
    "/admin/error-reports",
    response_model=list[AdminErrorReportRead],
    dependencies=[Depends(deps.get_admin)],
)
def list_error_reports(
    s: Session = Depends(deps.get_session),
) -> list[AdminErrorReportRead]:
    return [
        _to_admin_error_read(report, user)
        for report, user in support_crud.list_error_reports(s)
    ]


@router.put(
    "/admin/error-reports/{error_report_id}/resolve",
    response_model=AdminErrorReportRead,
    dependencies=[Depends(deps.get_admin)],
)
def resolve_error_report(
    error_report_id: int,
    s: Session = Depends(deps.get_session),
) -> AdminErrorReportRead:
    report, user = deps.get_or_404(
        support_crud.get_error_report_with_user,
        s,
        error_report_id,
        detail="Error report not found",
    )
    support_crud.resolve_error_report(s, report)
    s.commit()
    return _to_admin_error_read(report, user)


@router.get(
    "/admin/pending-counts",
    response_model=AdminPendingCounts,
    dependencies=[Depends(deps.get_admin)],
)
def get_pending_counts(
    s: Session = Depends(deps.get_session),
) -> AdminPendingCounts:
    return AdminPendingCounts(
        unanswered_feedbacks=support_crud.count_unanswered_feedbacks(s),
        unresolved_error_reports=support_crud.count_unresolved_error_reports(s),
    )
