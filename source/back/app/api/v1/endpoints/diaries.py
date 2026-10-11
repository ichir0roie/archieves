from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import diary as diary_crud
from app.db import User
from app.schemas.diary import DiaryCreate, DiaryRead

router = APIRouter()


@router.post("/diaries", response_model=DiaryRead, status_code=201)
def create_diary(
    diary_in: DiaryCreate,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> DiaryRead:
    result = diary_crud.create_diary(s, me.id, diary_in.body)
    s.commit()
    return result


@router.get("/diaries", response_model=list[DiaryRead])
def list_diaries(
    year: int | None = None,
    limit: int | None = Query(default=None, ge=1),
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> list[DiaryRead]:
    """新しい順。year は日本時間の年。limit を省くと全部を返す"""
    return diary_crud.list_diaries(s, me.id, year=year, limit=limit)


@router.get("/diaries/years", response_model=list[int])
def list_diary_years(
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> list[int]:
    """日記のある年(日本時間)。新しい年が先"""
    return diary_crud.list_diary_years(s, me.id)
