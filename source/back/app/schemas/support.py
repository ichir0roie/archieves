from datetime import datetime

from pydantic import BaseModel, Field

from app.core.support import MAX_EMAIL_LENGTH, MAX_FEEDBACK_LENGTH
from app.schemas.base import ResponseModel


class FeedbackCreate(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_FEEDBACK_LENGTH)
    # 省略したらログインのトークンの email を使う
    email: str | None = Field(default=None, max_length=MAX_EMAIL_LENGTH)


class FeedbackRead(ResponseModel):
    id: int
    user_id: int
    email: str | None
    body: str
    created_at: datetime
    reply: str | None
    replied_at: datetime | None


class AnnouncementRead(ResponseModel):
    id: int
    published_at: datetime
    body: str
