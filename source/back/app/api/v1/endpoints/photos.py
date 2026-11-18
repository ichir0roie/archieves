"""写真モードの写真。流れは app/services/photos.py。

置き場が手元(PHOTO_STORAGE=local)のときだけ、元の写真の送り・読みと表示の画像の読みを
/photos/{photo_id}/file で受ける。S3 のときは、ブラウザが署名付き URL で S3 に直に届く。
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.api import deps
from app.core.errors import NotFoundError
from app.core.photos import PHOTO_MAX_BYTES
from app.crud import game as game_crud
from app.crud import photo as photo_crud
from app.db import User
from app.schemas.photo import EndPhotoRead, PhotoUploadCreate, PhotoUploadRead
from app.services import photos as photo_service
from app.services.photo_storage import LocalPhotoStorage, PhotoStorage, get_photo_storage

router = APIRouter()


@router.post("/ends/{end_id}/photo", response_model=PhotoUploadRead, status_code=201)
def start_photo_upload(
    end_id: int,
    upload_in: PhotoUploadCreate,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
    storage: PhotoStorage = Depends(get_photo_storage),
) -> PhotoUploadRead:
    """エンドの写真を受け付け、元の写真を送る先を返す。撮り直しなら前の写真と置き換える"""
    end = deps.get_own_or_404(me, game_crud.get_end, s, end_id, detail="End not found")
    photo, target, old_keys = photo_service.start_upload(s, storage, end, upload_in.content_type)
    s.commit()
    # 前の写真のファイルは、置き換えがコミットされてから消す
    storage.delete(old_keys)
    return PhotoUploadRead(
        photo=photo_service.to_read(storage, photo),
        upload_url=target.url,
        upload_headers=target.headers,
    )


@router.post("/photos/{photo_id}/process", response_model=EndPhotoRead)
def process_photo(
    photo_id: int,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
    storage: PhotoStorage = Depends(get_photo_storage),
) -> EndPhotoRead:
    """置き場に届いた元の写真を処理する。処理が済んでいれば、処理し直さずに今の結果を返す"""
    photo = deps.get_own_or_404(me, photo_crud.get_photo, s, photo_id, detail="Photo not found")
    if photo_service.needs_processing(photo):
        original = storage.read(photo.original_key)
        if original is None:
            # ブラウザが送り終える前に頼んだ。送り直してから頼み直してもらう
            raise HTTPException(status_code=409, detail="Photo not uploaded")
        photo_service.process(s, storage, photo, original)
        s.commit()
    return photo_service.to_read(storage, photo)


@router.get("/games/{game_id}/photos", response_model=list[EndPhotoRead])
def list_game_photos(
    game_id: int,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
    storage: PhotoStorage = Depends(get_photo_storage),
) -> list[EndPhotoRead]:
    """ゲームのエンドの写真を、ラウンド・エンドの順に。処理の済んでいないものも含める"""
    deps.get_own_or_404(me, game_crud.get_game, s, game_id, detail="Game not found")
    return [
        photo_service.to_read(storage, photo) for photo in photo_crud.list_game_photos(s, game_id)
    ]


def _local_storage(storage: PhotoStorage) -> LocalPhotoStorage:
    """手元の置き場。S3 のときは、この道は無いものとする"""
    if not isinstance(storage, LocalPhotoStorage):
        raise NotFoundError("Not found")
    return storage


@router.put("/photos/{photo_id}/file", status_code=204)
async def upload_photo_file(
    photo_id: int,
    request: Request,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
    storage: PhotoStorage = Depends(get_photo_storage),
) -> None:
    """手元の置き場へ、元の写真を送る(S3 の署名付き URL への PUT の代わり)"""
    local = _local_storage(storage)
    photo = deps.get_own_or_404(me, photo_crud.get_photo, s, photo_id, detail="Photo not found")
    body = await request.body()
    if len(body) > PHOTO_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Photo too large")
    local.write(photo.original_key, body, photo.content_type)


@router.get("/photos/{photo_id}/file")
def read_photo_file(
    photo_id: int,
    kind: Literal["original", "display"] = "original",
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
    storage: PhotoStorage = Depends(get_photo_storage),
) -> Response:
    """手元の置き場の、元の写真か表示の画像を読む(S3 の署名付き URL の GET の代わり)"""
    local = _local_storage(storage)
    photo = deps.get_own_or_404(me, photo_crud.get_photo, s, photo_id, detail="Photo not found")
    key = photo.original_key if kind == "original" else photo.display_key
    data = local.read(key) if key is not None else None
    if data is None:
        raise NotFoundError("Photo file not found")
    media_type = photo.content_type if kind == "original" else "image/jpeg"
    return Response(content=data, media_type=media_type)
