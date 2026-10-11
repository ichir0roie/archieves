from datetime import datetime

from pydantic import BaseModel, Field

from app.core.support import (
    MAX_EMAIL_LENGTH,
    MAX_ERROR_MESSAGE_LENGTH,
    MAX_ERROR_METHOD_LENGTH,
    MAX_ERROR_PATH_LENGTH,
    MAX_FEEDBACK_LENGTH,
    ErrorReportKind,
)
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


class FeedbackReply(BaseModel):
    reply: str = Field(min_length=1, max_length=MAX_FEEDBACK_LENGTH)


class AdminFeedbackRead(FeedbackRead):
    """管理者が見る意見。誰が送ったかを添える。"""

    user_name: str
    user_nickname: str | None


class AnnouncementRead(ResponseModel):
    id: int
    published_at: datetime
    body: str


class ErrorReportCreate(BaseModel):
    kind: ErrorReportKind
    status_code: int = Field(ge=100, le=599)
    page_path: str = Field(min_length=1, max_length=MAX_ERROR_PATH_LENGTH)
    method: str | None = Field(default=None, max_length=MAX_ERROR_METHOD_LENGTH)
    api_path: str | None = Field(default=None, max_length=MAX_ERROR_PATH_LENGTH)
    message: str | None = Field(default=None, max_length=MAX_ERROR_MESSAGE_LENGTH)


class AdminErrorReportRead(ResponseModel):
    """管理者が見るエラー。登録の前の利用者からのものは利用者の欄が空。"""

    id: int
    user_id: int | None
    user_name: str | None
    kind: ErrorReportKind
    status_code: int
    page_path: str
    method: str | None
    api_path: str | None
    message: str | None
    created_at: datetime
    resolved_at: datetime | None


class AdminPendingCounts(ResponseModel):
    """管理者が片付けるものの件数。ホームと意見の確認ページに出す。"""

    unanswered_feedbacks: int
    unresolved_error_reports: int
