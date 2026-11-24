import math
from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.photos import (
    ANALYZER_VERSION_MAX_LENGTH,
    PHOTO_DISPLAY_MAX_BYTES,
    PHOTO_MAX_BYTES,
    PHOTO_MAX_ESTIMATES,
    PHOTO_MAX_PIXELS_PER_SIDE,
)
from app.schemas.base import ResponseModel

# 置き場のキーの長さ(db の列と同じ)
PHOTO_KEY_MAX_LENGTH = 255


class PhotoUploadCreate(BaseModel):
    # app/core/photos.py の PHOTO_EXTENSIONS。ほかの形式はフロントが JPEG に直してから送る
    content_type: Literal["image/jpeg", "image/png", "image/webp"]
    # 送る元の写真のバイト数。S3 の署名付き URL がこの大きさの PUT だけを通す
    content_length: int = Field(gt=0, le=PHOTO_MAX_BYTES)
    # 送る表示の画像(ブラウザが作った JPEG)のバイト数
    display_content_length: int = Field(gt=0, le=PHOTO_DISPLAY_MAX_BYTES)


class DisplayUploadCreate(BaseModel):
    """表示の画像を作り直して送る(手で的を合わせ直した)。送る JPEG のバイト数"""

    content_length: int = Field(gt=0, le=PHOTO_DISPLAY_MAX_BYTES)


def _check_alignment(points: list[list[float]]) -> list[list[float]]:
    """手で合わせた 4 点。赤の帯の外の線(7 点の外)の上・右・下・左の順。

    値は、向きを直した元の写真の幅・高さに対する割合
    """
    if len(points) != 4:
        raise ValueError("there must be 4 points: top, right, bottom, left")
    if any(len(p) != 2 or not all(math.isfinite(v) and -1 <= v <= 2 for v in p) for p in points):
        raise ValueError("each point must be [x, y] within the photo")
    # 上 → 右 → 下 → 左 は、画像の上で時計回りの凸な四角になる(つぶれた四角では補正が決まらない)
    following = points[1:] + points[:1]
    after = points[2:] + points[:2]
    crosses = [
        (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        for a, b, c in zip(points, following, after, strict=True)
    ]
    if min(crosses) <= 1e-6:
        raise ValueError("points must go clockwise around the target: top, right, bottom, left")
    return points


class EstimatedArrowWrite(BaseModel):
    """推測した矢の刺さった所。x・y は的に対する割合(左上が 0、中心が 0.5)。
    的紙の外に刺さった矢もあるので、的の外まで少し受ける"""

    x: float = Field(ge=-1, le=2, allow_inf_nan=False)
    y: float = Field(ge=-1, le=2, allow_inf_nan=False)
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)


class PhotoAnalysisWrite(BaseModel):
    """ブラウザが写真を処理した結果(source/front の lib/photo/vision)。

    表示の画像は先に置き場へ送っておく
    """

    # 送った表示の画像のキー(PhotoUploadRead・DisplayUploadRead の display_key)
    display_key: str = Field(min_length=1, max_length=PHOTO_KEY_MAX_LENGTH)
    analyzer_version: str = Field(min_length=1, max_length=ANALYZER_VERSION_MAX_LENGTH)
    # 向きを直したあとの元の写真の大きさ
    width: int = Field(gt=0, le=PHOTO_MAX_PIXELS_PER_SIDE)
    height: int = Field(gt=0, le=PHOTO_MAX_PIXELS_PER_SIDE)
    rectified: bool
    display_extent: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    # 元の写真の px を、的に対する割合へ写す 3x3
    homography: list[list[float]] | None = None
    estimates: list[EstimatedArrowWrite] = Field(
        default_factory=list, max_length=PHOTO_MAX_ESTIMATES
    )
    # 手で合わせた 4 点。自動で補正した・補正できなかったなら null
    alignment_points: list[list[float]] | None = None

    @field_validator("homography")
    @classmethod
    def _matrix(cls, homography: list[list[float]] | None) -> list[list[float]] | None:
        if homography is None:
            return None
        if len(homography) != 3 or any(
            len(row) != 3 or not all(math.isfinite(v) for v in row) for row in homography
        ):
            raise ValueError("homography must be a 3x3 matrix of finite numbers")
        return homography

    @field_validator("alignment_points")
    @classmethod
    def _alignment(cls, points: list[list[float]] | None) -> list[list[float]] | None:
        return None if points is None else _check_alignment(points)

    @model_validator(mode="after")
    def _rectification(self) -> Self:
        # 補正できたなら、写し方と表示の画像の範囲がある。できなければ推測も無い
        if self.rectified and (self.homography is None or self.display_extent is None):
            raise ValueError("a rectified photo needs its homography and display_extent")
        if not self.rectified and (
            self.homography is not None or self.display_extent is not None or self.estimates
        ):
            raise ValueError("a photo that is not rectified has no homography or estimates")
        return self


class EstimatedArrowRead(ResponseModel):
    """推測した矢の刺さった所。x・y は的に対する割合(左上が 0、中心が 0.5)"""

    x: float
    y: float
    confidence: float


class EndPhotoRead(ResponseModel):
    id: int
    end_id: int
    # uploading / processed / failed
    status: str
    width: int | None
    height: int | None
    # 表示の画像が、的を正面から見た形に補正したもの。そのとき表示の画像は、的に対する割合で
    # -display_extent から 1 + display_extent までの正方形
    rectified: bool
    display_extent: float | None
    estimates: list[EstimatedArrowRead]
    # 合わせる 4 点(PhotoAnalysisWrite の alignment_points と同じ形)。手で合わせていればその点、
    # 補正できていれば補正から求めた点、どちらでもなければ null
    alignment_points: list[list[float]] | None
    aligned_manually: bool
    analyzer_version: str | None
    error: str | None
    created_at: datetime
    processed_at: datetime | None
    # 置き場の URL。http で始まれば S3 の署名付き URL(期限つき)。そうでなければ API の道
    # (/api/v1 からの相対)で、ログインを付けて読む
    original_url: str
    # 処理が済むまでは null
    display_url: str | None


class DisplayUploadRead(ResponseModel):
    # 表示の画像を置くキー。送り終えたら、処理の結果と一緒に PhotoAnalysisWrite で渡す
    display_key: str
    # PUT で送る先と、付けるヘッダー。送る本文は、渡した大きさと同じにする
    upload_url: str
    upload_headers: dict[str, str]


class PhotoUploadRead(ResponseModel):
    photo: EndPhotoRead
    # 元の写真を PUT で送る先と、付けるヘッダー。upload_url の形は original_url と同じ決まり。
    # 送る本文は、受け付けで渡した content_length と同じ大きさにする(違えば S3 が 403 で弾く)
    upload_url: str
    upload_headers: dict[str, str]
    # 表示の画像を送る先
    display: DisplayUploadRead
