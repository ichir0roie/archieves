"""写真モードの写真の受け付けと、処理の結果の受け取り。

写真の処理(的の補正と矢の推測)はブラウザが行う(source/front の lib/photo/vision)。API は写真と
結果を置くだけにする。

1. 受け付け(start_upload): エンドに写真の行を作り、元の写真と表示の画像を送る先(置き場の URL)を返す
2. ブラウザが元の写真と、自分で作った表示の画像を置き場へ送る
3. 結果の受け取り(save_analysis): 二つが置き場に届いていれば、処理の結果を行に書く

手で的を合わせ直したときは、表示の画像を送る先をもう一度もらい(display_upload)、2・3 をやり直す。
ブラウザは、画面を閉じて送りや結果の応答を受け取り損ねても、画面に戻ったときに 2・3 をやり直す。
どちらも同じ写真に何度呼ばれてもよい形にする。
"""

import logging
import re
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.photos import PHOTO_EXTENSIONS, PhotoStatus
from app.crud import photo as photo_crud
from app.db import End, EndPhoto
from app.schemas.photo import EndPhotoRead, EstimatedArrowRead, PhotoAnalysisWrite
from app.services.photo_storage import PhotoStorage, UploadTarget, user_prefix

logger = logging.getLogger(__name__)

# 手で合わせるときの 4 点の、的の上の位置(的に対する割合)。赤の帯の外の線(7 点の外)の
# 上・右・下・左。source/front の lib/photo/alignment.ts の ALIGNMENT_TARGET_POINTS と同じ
ALIGNMENT_RADIUS = 0.2
ALIGNMENT_TARGET_POINTS = [
    (0.5, 0.5 - ALIGNMENT_RADIUS),
    (0.5 + ALIGNMENT_RADIUS, 0.5),
    (0.5, 0.5 + ALIGNMENT_RADIUS),
    (0.5 - ALIGNMENT_RADIUS, 0.5),
]


class DisplayKeyError(ValueError):
    """表示の画像のキーが、その写真のものでない(API が渡したキーでない)"""


class PhotoNotUploadedError(Exception):
    """元の写真か表示の画像が、まだ置き場に届いていない"""


def _stem(original_key: str) -> str:
    stem, _, _ = original_key.rpartition(".")
    return stem


def new_display_key(photo: EndPhoto) -> str:
    """表示の画像を置く新しいキー。作り直すたびに別のキーにし、前の画像を送り終えるまで残す"""
    return f"{_stem(photo.original_key)}-display-{uuid.uuid4().hex}.jpg"


def is_display_key(photo: EndPhoto, key: str) -> bool:
    """その写真のために new_display_key が作ったキーか"""
    return (
        re.fullmatch(re.escape(_stem(photo.original_key)) + r"-display-[0-9a-f]{32}\.jpg", key)
        is not None
    )


def start_upload(
    s: Session,
    storage: PhotoStorage,
    end: End,
    content_type: str,
    content_length: int,
    display_content_length: int,
) -> tuple[EndPhoto, UploadTarget, str, UploadTarget, list[str]]:
    """エンドの写真の行を作り直し、元の写真・表示の画像を送る先を返す。撮り直しなら前の行を消し、
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
    display_key = new_display_key(photo)
    return (
        photo,
        storage.upload_target(photo.id, key, content_type, content_length),
        display_key,
        storage.upload_target(photo.id, display_key, "image/jpeg", display_content_length),
        old_keys,
    )


def display_upload(
    storage: PhotoStorage, photo: EndPhoto, content_length: int
) -> tuple[str, UploadTarget]:
    """表示の画像を作り直して送る先。行は書き換えない(結果を受け取るまで、前の画像を出す)"""
    display_key = new_display_key(photo)
    return display_key, storage.upload_target(photo.id, display_key, "image/jpeg", content_length)


def discard_photos(s: Session, photos: list[EndPhoto]) -> list[str]:
    """写真の行を消し、置き場のファイルのキーを返す。ファイルは、呼ぶ側がコミットのあとで消す
    (コミットできなかったのにファイルだけ消えないように)。エンドを消すときに使う。
    ゴミ箱へ入れるラウンド・ゲームは戻せるので、その写真は消さない"""
    keys = [key for photo in photos for key in (photo.original_key, photo.display_key) if key]
    for photo in photos:
        photo_crud.delete_photo(s, photo)
    return keys


def save_analysis(
    s: Session,
    storage: PhotoStorage,
    photo: EndPhoto,
    analysis: PhotoAnalysisWrite,
) -> list[str]:
    """ブラウザが処理した結果を行に書く。前の表示の画像のキーを返す(呼ぶ側がコミットのあとで消す)。
    表示の画像のキーがその写真のものでなければ DisplayKeyError、元の写真か表示の画像が
    置き場に届いていなければ PhotoNotUploadedError"""
    if not is_display_key(photo, analysis.display_key):
        raise DisplayKeyError("Display key does not belong to the photo")
    if not storage.exists(photo.original_key) or not storage.exists(analysis.display_key):
        raise PhotoNotUploadedError()

    old_keys = [
        key for key in (photo.display_key,) if key is not None and key != analysis.display_key
    ]
    photo.status = PhotoStatus.PROCESSED
    photo.error = None
    photo.display_key = analysis.display_key
    photo.analyzer_version = analysis.analyzer_version
    photo.processed_at = datetime.now(UTC)
    photo.width = analysis.width
    photo.height = analysis.height
    photo.rectified = analysis.rectified
    photo.display_extent = analysis.display_extent
    photo.homography = analysis.homography
    photo.alignment_points = analysis.alignment_points
    photo.estimates = [arrow.model_dump() for arrow in analysis.estimates]
    s.flush()
    logger.info(
        "photo %s analyzed in the browser: version=%s rectified=%s arrows=%s",
        photo.id,
        analysis.analyzer_version,
        analysis.rectified,
        len(analysis.estimates),
    )
    return old_keys


def _invert(m: list[list[float]]) -> list[list[float]] | None:
    a, b, c = m[0]
    d, e, f = m[1]
    g, h, i = m[2]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if det == 0:
        return None
    return [
        [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
        [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
        [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
    ]


def _alignment_points(photo: EndPhoto) -> list[list[float]] | None:
    """合わせる 4 点。手で合わせていなければ、補正の行列から
    画像の上の位置(幅・高さに対する割合)を求める"""
    if photo.alignment_points is not None:
        return photo.alignment_points
    if photo.homography is None or photo.width is None or photo.height is None:
        return None
    inverse = _invert(photo.homography)
    if inverse is None:
        return None
    points = []
    for x, y in ALIGNMENT_TARGET_POINTS:
        u, v, w = (row[0] * x + row[1] * y + row[2] for row in inverse)
        points.append([u / w / photo.width, v / w / photo.height])
    return points


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
