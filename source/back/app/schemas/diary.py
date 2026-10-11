from datetime import datetime

from pydantic import BaseModel, Field

from app.core.diary import MAX_DIARY_LENGTH
from app.schemas.base import ResponseModel


class DiaryCreate(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_DIARY_LENGTH)


class DiaryRead(ResponseModel):
    id: int
    user_id: int
    body: str
    created_at: datetime
