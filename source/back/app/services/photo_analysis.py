"""写真モードの写真を処理する。表示の画像を作り、的を正面に補正し、矢の刺さった点を推測する。

- 的が見つかれば(target_detection.py)、表示の画像は的を正面から見た形の正方形にする。
  的に対する割合で -DISPLAY_EXTENT から 1 + DISPLAY_EXTENT まで(的紙の外に刺さった矢も写す)
- 矢は arrow_detection.py で探し、確からしい順に返す
- 的が見つからなければ、向きを直して縮めただけの画像にする(補正も推測もしない)

処理を変えたら ANALYZER_VERSION を上げる。古いバージョンで処理した写真は、
もう一度処理を頼まれたときに
処理し直す(endpoints/photos.py)。
"""

import io
import logging
from dataclasses import dataclass, field

import cv2
import numpy as np
from PIL import ExifTags, Image, ImageOps, UnidentifiedImageError

from app.core.arrow_colors import ArrowColor
from app.services.arrow_detection import detect_arrows
from app.services.target_detection import find_target

logger = logging.getLogger(__name__)

ANALYZER_VERSION = "rings-1"

# 表示の画像の長辺(px)。スマホの写真で的が写る幅(2000〜2500px)に見合い、入力の画面のズームで
# 見ても粗くない。これより大きくしても、元の写真に無い細かさは出ない
DISPLAY_MAX_PX = 2000
DISPLAY_JPEG_QUALITY = 85
# 的と矢を探す作業画像の長辺(px)。的を見つけるにはこれで足り、元の大きさで探すより速い
WORK_PX = 1000
# 補正した表示の画像に、的の外をどこまで写すか(的に対する割合)
DISPLAY_EXTENT = 0.25
# 返す推測の数の上限(1 エンドの矢の数より多めに返し、画面が本数で切る)
MAX_ESTIMATES = 24


class PhotoUnreadableError(ValueError):
    """画像として読めない。壊れたファイル・画像でないファイル"""


@dataclass(frozen=True)
class EstimatedArrow:
    """推測した矢の刺さった所。x・y は的に対する割合(左上が 0、中心が 0.5)"""

    x: float
    y: float
    confidence: float


@dataclass(frozen=True)
class PhotoAnalysis:
    display_jpeg: bytes
    # 向きを直したあとの元の写真の大きさ
    width: int
    height: int
    rectified: bool = False
    display_extent: float | None = None
    homography: list[list[float]] | None = None
    estimates: list[EstimatedArrow] = field(default_factory=list)


def analyze(
    original: bytes,
    nock_color: ArrowColor | None = None,
    fletch_color: ArrowColor | None = None,
) -> PhotoAnalysis:
    try:
        # 元の写真の大きさは、画素を広げる前にヘッダーから読む(draft で縮めると変わるため)
        width, height = _original_size(original)
        image = Image.open(io.BytesIO(original))
        # JPEG は読み込むときに縮めると速く、メモリも少なく済む(12MP を全部広げない)
        image.draft("RGB", (DISPLAY_MAX_PX, DISPLAY_MAX_PX))
        # スマホの写真は、画素を横のまま持って向きを EXIF で指すことがある
        image = ImageOps.exif_transpose(image).convert("RGB")
    # 画素の多すぎる画像(DecompressionBombError)も、壊れたファイルと同じく読めないものにする
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise PhotoUnreadableError(str(e)) from e

    decoded = np.asarray(image)[:, :, ::-1].copy()
    work_scale = min(1.0, WORK_PX / max(decoded.shape[:2]))
    work = cv2.resize(decoded, None, fx=work_scale, fy=work_scale, interpolation=cv2.INTER_AREA)
    fit = find_target(work)
    if fit is None:
        image.thumbnail((DISPLAY_MAX_PX, DISPLAY_MAX_PX))
        logger.info("photo analyzed without a target: original=%sx%s", width, height)
        return PhotoAnalysis(display_jpeg=_jpeg(image), width=width, height=height)

    # 作業画像の px → 的の割合 を、読み込んだ画像の px・元の写真の px からのものにする
    to_decoded = fit.homography @ np.diag([work_scale, work_scale, 1.0])
    decoded_scale = decoded.shape[1] / width
    to_original = to_decoded @ np.diag([decoded_scale, decoded_scale, 1.0])
    # 的の割合 → 表示の画像の px
    side = DISPLAY_MAX_PX
    unit = side / (1 + 2 * DISPLAY_EXTENT)
    to_display = np.array(
        [[unit, 0, unit * DISPLAY_EXTENT], [0, unit, unit * DISPLAY_EXTENT], [0, 0, 1]]
    )
    display = cv2.warpPerspective(decoded, to_display @ to_decoded, (side, side))
    arrows = detect_arrows(work, fit, nock_color, fletch_color)[:MAX_ESTIMATES]
    logger.info(
        "photo analyzed: original=%sx%s arrows=%s",
        width,
        height,
        len(arrows),
    )
    return PhotoAnalysis(
        display_jpeg=_jpeg(Image.fromarray(display[:, :, ::-1])),
        width=width,
        height=height,
        rectified=True,
        display_extent=DISPLAY_EXTENT,
        homography=(to_original / to_original[2, 2]).tolist(),
        estimates=[EstimatedArrow(x=a.x, y=a.y, confidence=a.confidence) for a in arrows],
    )


def _jpeg(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=DISPLAY_JPEG_QUALITY, optimize=True)
    return buffer.getvalue()


def _original_size(original: bytes) -> tuple[int, int]:
    """元の写真の、EXIF の向きを直したあとの大きさ"""
    with Image.open(io.BytesIO(original)) as image:
        width, height = image.size
        orientation = image.getexif().get(ExifTags.Base.Orientation)
    # 5〜8 は 90 度回す向き
    if orientation in (5, 6, 7, 8):
        return height, width
    return width, height
