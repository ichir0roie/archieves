from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.api.pagination import MAX_LIMIT
from app.crud import diary as diary_crud
from app.db import User
from app.schemas.diary import (
    DiaryCreate,
    DiaryImport,
    DiaryImportResult,
    DiaryRead,
    DiaryUpdate,
)

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


@router.post("/diaries/import", response_model=DiaryImportResult, status_code=201)
def import_diaries(
    diary_import: DiaryImport,
    me: User = Depends(deps.get_diary_importer),
    s: Session = Depends(deps.get_session),
) -> DiaryImportResult:
    """AI(Claude など)が、本人のトークンで別の所の日記を書いた日時ごと取り込む。"""
    imported, skipped = diary_crud.import_diaries(
        s,
        me.id,
        [(item.body, item.written_at) for item in diary_import.diaries],
    )
    s.commit()
    return DiaryImportResult(imported=imported, skipped=skipped)


@router.get("/diaries", response_model=list[DiaryRead])
def list_diaries(
    year: int | None = None,
    limit: Annotated[int | None, Query(ge=1, le=MAX_LIMIT)] = None,
    me: User = Depends(deps.get_reader),
    s: Session = Depends(deps.get_session),
) -> list[DiaryRead]:
    """新しい順。year は日本時間の年。limit を省くと全部を返す"""
    return diary_crud.list_diaries(s, me.id, year=year, limit=limit)


@router.get("/diaries/years", response_model=list[int])
def list_diary_years(
    me: User = Depends(deps.get_reader),
    s: Session = Depends(deps.get_session),
) -> list[int]:
    """日記のある年(日本時間)。新しい年が先"""
    return diary_crud.list_diary_years(s, me.id)


@router.patch("/diaries/{diary_id}", response_model=DiaryRead)
def update_diary(
    diary_id: int,
    diary_in: DiaryUpdate,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> DiaryRead:
    diary = deps.get_own_or_404(me, diary_crud.get_diary, s, diary_id, detail="Diary not found")
    result = diary_crud.update_diary(s, diary, diary_in.body)
    s.commit()
    return result


@router.delete("/diaries/{diary_id}", status_code=204)
def delete_diary(
    diary_id: int,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> None:
    diary = deps.get_own_or_404(me, diary_crud.get_diary, s, diary_id, detail="Diary not found")
    diary_crud.delete_diary(s, diary)
    s.commit()
