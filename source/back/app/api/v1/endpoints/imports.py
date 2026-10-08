from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.api import deps
from app.core.errors import NotFoundError
from app.crud import user as user_crud
from app.schemas.imports import ImportResult
from app.services.import_sources import ImportSource, import_file

router = APIRouter()


@router.post("/import", response_model=ImportResult, status_code=201)
def import_export_file(
    source: ImportSource = Form(...),
    file: UploadFile = File(...),
    current_user: deps.Claims = Depends(deps.get_current_user),
    s: Session = Depends(deps.get_session),
) -> ImportResult:
    """他のアプリのエクスポートファイルを、その種類(source)に合わせて読み、本人の記録として取り込む。"""
    user = user_crud.get_user_by_sub(s, current_user.sub)
    if user is None:
        raise NotFoundError("User not found")

    summary = import_file(
        s,
        source=source,
        filename=file.filename or "",
        file=file.file,
        user_id=user.id,
    )
    s.commit()

    return ImportResult(
        games=summary.games,
        rounds=summary.rounds,
        ends=summary.ends,
        points=summary.points,
    )
