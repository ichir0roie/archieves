from datetime import datetime

from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session

from app.core.timezone import JST
from app.db import Diary

# 年は日本時間で切る(created_at は UTC で入る)
_created_year = extract("year", func.timezone("Asia/Tokyo", Diary.created_at))


def create_diary(s: Session, user_id: int, body: str) -> Diary:
    diary = Diary(user_id=user_id, body=body)
    s.add(diary)
    s.flush()
    s.refresh(diary)
    return diary


def list_diaries(
    s: Session,
    user_id: int,
    year: int | None = None,
    limit: int | None = None,
) -> list[Diary]:
    """新しい順。year は日本時間の年。limit を省くと全部を返す"""
    stmt = (
        select(Diary)
        .where(Diary.user_id == user_id, Diary.deleted_at.is_(None))
        .order_by(Diary.created_at.desc(), Diary.id.desc())
        .limit(limit)
    )
    if year is not None:
        stmt = stmt.where(
            Diary.created_at >= datetime(year, 1, 1, tzinfo=JST),
            Diary.created_at < datetime(year + 1, 1, 1, tzinfo=JST),
        )
    return list(s.scalars(stmt))


def list_diary_years(s: Session, user_id: int) -> list[int]:
    """日記のある年(日本時間)。新しい年が先"""
    stmt = (
        select(_created_year)
        .where(Diary.user_id == user_id, Diary.deleted_at.is_(None))
        .group_by(_created_year)
        .order_by(_created_year.desc())
    )
    return [int(value) for value in s.scalars(stmt)]
