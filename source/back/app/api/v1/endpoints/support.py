from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import support as support_crud
from app.db import User
from app.schemas.support import AnnouncementRead, FeedbackCreate, FeedbackRead

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
    me: User = Depends(deps.get_me), s: Session = Depends(deps.get_session)
) -> list[FeedbackRead]:
    return support_crud.list_feedbacks(s, me.id)


@router.get("/announcements", response_model=list[AnnouncementRead])
def list_announcements(s: Session = Depends(deps.get_session)) -> list[AnnouncementRead]:
    return support_crud.list_recent_announcements(s)
