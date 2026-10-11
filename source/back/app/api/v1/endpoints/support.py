from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import support as support_crud
from app.db import Feedback, User
from app.schemas.support import (
    AdminFeedbackRead,
    AnnouncementRead,
    FeedbackCreate,
    FeedbackRead,
    FeedbackReply,
)

router = APIRouter()


@router.post("/feedbacks", response_model=FeedbackRead, status_code=201)
def create_feedback(
    feedback_in: FeedbackCreate,
    me: User = Depends(deps.get_me),
    claims: deps.Claims = Depends(deps.get_current_user),
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


@router.get("/announcements", response_model=list[AnnouncementRead])
def list_announcements(
    s: Session = Depends(deps.get_session),
) -> list[AnnouncementRead]:
    return support_crud.list_recent_announcements(s)
