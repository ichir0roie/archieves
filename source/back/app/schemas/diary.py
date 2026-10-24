from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.diary import MAX_DIARY_IMPORT_COUNT, MAX_DIARY_LENGTH
from app.core.timezone import JST
from app.schemas.base import ResponseModel


class DiaryCreate(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_DIARY_LENGTH)


class DiaryRead(ResponseModel):
    id: int
    user_id: int
    body: str
    created_at: datetime


class DiaryImportItem(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_DIARY_LENGTH)
    # 書いた日時。タイムゾーンの無い日時は日本時間とみなす
    written_at: datetime

    @field_validator("written_at")
    @classmethod
    def _assume_jst(cls, value: datetime) -> datetime:
        return value if value.tzinfo is not None else value.replace(tzinfo=JST)


class DiaryImport(BaseModel):
    diaries: list[DiaryImportItem] = Field(min_length=1, max_length=MAX_DIARY_IMPORT_COUNT)


class DiaryImportResult(ResponseModel):
    imported: list[DiaryRead]
    # 同じ本文・同じ日時の日記がもうあり、取り込まなかった件数
    skipped: int
