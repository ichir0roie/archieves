"""写真モードの写真。流れは app/services/photos.py。

置き場が手元(PHOTO_STORAGE=local)のときだけ、元の写真・表示の画像の送り・読みを
/photos/{photo_id}/file で受ける。S3 のときは、ブラウザが署名付き URL で S3 に直に届く。
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.api import deps
from app.core.errors import NotFoundError, UnprocessableError
from app.core.photos import PHOTO_DISPLAY_MAX_BYTES, PHOTO_MAX_BYTES
from app.crud import game as game_crud
from app.crud import photo as photo_crud
from app.db import User
from app.schemas.photo import (
    DisplayUploadCreate,
    DisplayUploadRead,
    EndPhotoRead,
    PhotoAnalysisWrite,
    PhotoUploadCreate,
    PhotoUploadRead,
)
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
    """エンドの写真を受け付け、元の写真と表示の画像を送る先を返す。撮り直しなら前の写真と置き換える"""
    end = deps.get_own_or_404(me, game_crud.get_end, s, end_id, detail="End not found")
    photo, target, display_key, display_target, old_keys = photo_service.start_upload(
        s,
        storage,
        end,
        upload_in.content_type,
        upload_in.content_length,
        upload_in.display_content_length,
    )
    s.commit()
    # 前の写真のファイルは、置き換えがコミットされてから消す
    storage.delete(old_keys)
    return PhotoUploadRead(
        photo=photo_service.to_read(storage, photo),
        upload_url=target.url,
        upload_headers=target.headers,
        display=DisplayUploadRead(
            display_key=display_key,
            upload_url=display_target.url,
            upload_headers=display_target.headers,
        ),
    )


@router.post("/photos/{photo_id}/display", response_model=DisplayUploadRead)
def start_display_upload(
    photo_id: int,
    upload_in: DisplayUploadCreate,
    me: User = Depends(deps.get_me),
    storage: PhotoStorage = Depends(get_photo_storage),
    s: Session = Depends(deps.get_session),
) -> DisplayUploadRead:
    """表示の画像を作り直して送る先(手で的を合わせ直した・前の処理の結果が届かなかった)。行は変えない"""
    photo = deps.get_own_or_404(me, photo_crud.get_photo, s, photo_id, detail="Photo not found")
    display_key, target = photo_service.display_upload(storage, photo, upload_in.content_length)
    return DisplayUploadRead(
        display_key=display_key,
        upload_url=target.url,
        upload_headers=target.headers,
    )


@router.put("/photos/{photo_id}/analysis", response_model=EndPhotoRead)
def save_photo_analysis(
    photo_id: int,
    analysis_in: PhotoAnalysisWrite,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
    storage: PhotoStorage = Depends(get_photo_storage),
) -> EndPhotoRead:
    """ブラウザが処理した結果(的の補正と矢の推測)を書く。元の写真と表示の画像は先に送っておく"""
    photo = deps.get_own_or_404(me, photo_crud.get_photo, s, photo_id, detail="Photo not found")
    try:
        old_keys = photo_service.save_analysis(s, storage, photo, analysis_in)
    except photo_service.DisplayKeyError as e:
        raise UnprocessableError(str(e)) from e
    except photo_service.PhotoNotUploadedError as e:
        # ブラウザが送り終える前に書いた。送り直してから書き直してもらう
        raise HTTPException(status_code=409, detail="Photo not uploaded") from e
    s.commit()
    # 前の表示の画像は、置き換えがコミットされてから消す
    storage.delete(old_keys)
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
    key: str | None = None,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
    storage: PhotoStorage = Depends(get_photo_storage),
) -> None:
    """手元の置き場へ、元の写真か表示の画像を送る(S3 の署名付き URL への PUT の代わり)。
    key は送る先(受け付けが返した送る先の URL に載っている)。無ければ元の写真"""
    local = _local_storage(storage)
    photo = deps.get_own_or_404(me, photo_crud.get_photo, s, photo_id, detail="Photo not found")
    if key is None or key == photo.original_key:
        key, limit = photo.original_key, PHOTO_MAX_BYTES
    elif photo_service.is_display_key(photo, key):
        limit = PHOTO_DISPLAY_MAX_BYTES
    else:
        raise UnprocessableError("Key does not belong to the photo")
    body = await request.body()
    if len(body) > limit:
        raise HTTPException(status_code=413, detail="Photo too large")
    local.write(key, body, request.headers.get("content-type", photo.content_type))


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
