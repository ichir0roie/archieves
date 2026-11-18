"""写真モードの写真の受け付けと処理。

1. 受け付け(start_upload): エンドに写真の行を作り、元の写真を送る先(置き場の URL)を返す
2. ブラウザが元の写真を置き場へ送る
3. 処理(process): 置き場の元の写真から表示の画像を作り、補正と推測の結果を行に書く

ブラウザは、画面を閉じて送りや処理の応答を受け取り損ねても、画面に戻ったときに 2・3 をやり直す。
どちらも同じ写真に何度呼ばれてもよい形にする。
"""

import logging
import uuid
from datetime import UTC, datetime

import numpy as np
from sqlalchemy.orm import Session

from app.core.arrow_colors import ArrowColor
from app.core.photos import PHOTO_EXTENSIONS, PHOTO_MAX_BYTES, PhotoStatus
from app.crud import photo as photo_crud
from app.db import End, EndPhoto
from app.schemas.photo import EndPhotoRead, EstimatedArrowRead
from app.services.photo_analysis import ANALYZER_VERSION, PhotoUnreadableError, analyze
from app.services.photo_storage import PhotoStorage, UploadTarget, user_prefix
from app.services.target_detection import alignment_points

logger = logging.getLogger(__name__)


def _display_key(original_key: str) -> str:
    stem, _, _ = original_key.rpartition(".")
    return f"{stem}-display.jpg"


def start_upload(
    s: Session,
    storage: PhotoStorage,
    end: End,
    content_type: str,
) -> tuple[EndPhoto, UploadTarget, list[str]]:
    """エンドの写真の行を作り直し、元の写真を送る先を返す。撮り直しなら前の行を消し、
    前のファイルのキーも返す(呼ぶ側がコミットのあとで置き場から消す)"""
    old_keys: list[str] = []
    old = photo_crud.get_end_photo(s, end.id)
    if old is not None:
        old_keys = [key for key in (old.original_key, old.display_key) if key is not None]
        photo_crud.delete_photo(s, old)

    key = f"{user_prefix(end.user_id)}{end.id}/{uuid.uuid4().hex}{PHOTO_EXTENSIONS[content_type]}"
    photo = photo_crud.create_photo(
        s,
        end,
        status=PhotoStatus.UPLOADING,
        content_type=content_type,
        original_key=key,
    )
    return photo, storage.upload_target(photo.id, key, content_type), old_keys


def discard_photos(s: Session, photos: list[EndPhoto]) -> list[str]:
    """写真の行を消し、置き場のファイルのキーを返す。ファイルは、呼ぶ側がコミットのあとで消す
    (コミットできなかったのにファイルだけ消えないように)。エンドを消すときに使う。
    ゴミ箱へ入れるラウンド・ゲームは戻せるので、その写真は消さない"""
    keys = [key for photo in photos for key in (photo.original_key, photo.display_key) if key]
    for photo in photos:
        photo_crud.delete_photo(s, photo)
    return keys


def needs_processing(photo: EndPhoto) -> bool:
    """まだ処理していないか、今より古い処理の結果。読めなかった写真は、処理が変わるまでやり直さない"""
    return photo.status == PhotoStatus.UPLOADING or photo.analyzer_version != ANALYZER_VERSION


def process(s: Session, storage: PhotoStorage, photo: EndPhoto, original: bytes) -> EndPhoto:
    """元の写真を処理して、結果を行に書く。読めない写真は failed にする(撮り直してもらう)"""
    photo.analyzer_version = ANALYZER_VERSION
    photo.processed_at = datetime.now(UTC)
    if len(original) > PHOTO_MAX_BYTES:
        return _fail(s, photo, "too_large")
    # 同じ的に刺さったほかの人の矢と見分けるよう、ゲームの矢の色で探す
    game = photo_crud.get_photo_game(s, photo)
    try:
        result = analyze(
            original,
            ArrowColor(game.nock_color) if game.nock_color else None,
            ArrowColor(game.fletch_color) if game.fletch_color else None,
            photo.alignment_points,
        )
    except PhotoUnreadableError as e:
        logger.warning("photo %s is unreadable: %s", photo.id, e)
        return _fail(s, photo, "unreadable")

    display_key = _display_key(photo.original_key)
    storage.write(display_key, result.display_jpeg, "image/jpeg")
    photo.status = PhotoStatus.PROCESSED
    photo.error = None
    photo.display_key = display_key
    photo.width = result.width
    photo.height = result.height
    photo.rectified = result.rectified
    photo.display_extent = result.display_extent
    photo.homography = result.homography
    photo.estimates = [
        {"x": arrow.x, "y": arrow.y, "confidence": arrow.confidence} for arrow in result.estimates
    ]
    s.flush()
    return photo


def _fail(s: Session, photo: EndPhoto, error: str) -> EndPhoto:
    photo.status = PhotoStatus.FAILED
    photo.error = error
    s.flush()
    return photo


def _alignment_points(photo: EndPhoto) -> list[list[float]] | None:
    if photo.alignment_points is not None:
        return photo.alignment_points
    if photo.homography is None or photo.width is None or photo.height is None:
        return None
    return alignment_points(np.array(photo.homography), photo.width, photo.height)


def to_read(storage: PhotoStorage, photo: EndPhoto) -> EndPhotoRead:
    """応答の形。置き場の URL(署名付きなら期限つき)をそのたびに作る"""
    return EndPhotoRead(
        id=photo.id,
        end_id=photo.end_id,
        status=photo.status,
        width=photo.width,
        height=photo.height,
        rectified=photo.rectified,
        display_extent=photo.display_extent,
        estimates=[EstimatedArrowRead.model_validate(arrow) for arrow in photo.estimates or []],
        alignment_points=_alignment_points(photo),
        aligned_manually=photo.alignment_points is not None,
        analyzer_version=photo.analyzer_version,
        error=photo.error,
        created_at=photo.created_at,
        processed_at=photo.processed_at,
        original_url=storage.download_url(photo.id, photo.original_key, "original"),
        display_url=(
            storage.download_url(photo.id, photo.display_key, "display")
            if photo.display_key is not None
            else None
        ),
    )
