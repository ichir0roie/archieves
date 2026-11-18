"""写真モードの写真を処理する。表示の画像を作り、的の補正と矢の位置の推測をする。

今は表示の画像(向きを直して長辺を縮めたもの)を作るだけで、的の補正と矢の推測はまだしない
(rectified は False、estimates は空)。画像処理のアルゴリズムは、実物の写真で詰めてから足す。
足したら ANALYZER_VERSION を上げる。古いバージョンで処理した写真は、もう一度処理を頼まれたときに
処理し直す(endpoints/photos.py)。
"""

import io
import logging
from dataclasses import dataclass, field

from PIL import ExifTags, Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)

ANALYZER_VERSION = "display-1"

# 表示の画像の長辺(px)。スマホの写真で的が写る幅(2000〜2500px)に見合い、入力の画面のズームで
# 見ても粗くない。これより大きくしても、元の写真に無い細かさは出ない
DISPLAY_MAX_PX = 2000
DISPLAY_JPEG_QUALITY = 85


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


def analyze(original: bytes) -> PhotoAnalysis:
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

    image.thumbnail((DISPLAY_MAX_PX, DISPLAY_MAX_PX))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=DISPLAY_JPEG_QUALITY, optimize=True)
    logger.info(
        "photo analyzed: original=%sx%s display=%sx%s",
        width,
        height,
        *image.size,
    )
    return PhotoAnalysis(display_jpeg=buffer.getvalue(), width=width, height=height)


def _original_size(original: bytes) -> tuple[int, int]:
    """元の写真の、EXIF の向きを直したあとの大きさ"""
    with Image.open(io.BytesIO(original)) as image:
        width, height = image.size
        orientation = image.getexif().get(ExifTags.Base.Orientation)
    # 5〜8 は 90 度回す向き
    if orientation in (5, 6, 7, 8):
        return height, width
    return width, height
