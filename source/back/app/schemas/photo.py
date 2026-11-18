from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.photos import PHOTO_MAX_BYTES
from app.schemas.base import ResponseModel


class PhotoUploadCreate(BaseModel):
    # app/core/photos.py の PHOTO_EXTENSIONS。ほかの形式はフロントが JPEG に直してから送る
    content_type: Literal["image/jpeg", "image/png", "image/webp"]
    # 送る元の写真のバイト数。S3 の署名付き URL がこの大きさの PUT だけを通す
    content_length: int = Field(gt=0, le=PHOTO_MAX_BYTES)


class PhotoAlignmentWrite(BaseModel):
    """手で合わせた 4 点。赤の帯の外の線(7 点の外)の上・右・下・左の順。

    値は、向きを直した元の写真の幅・高さに対する割合
    """

    points: list[list[float]] = Field(min_length=4, max_length=4)

    @field_validator("points")
    @classmethod
    def _convex(cls, points: list[list[float]]) -> list[list[float]]:
        if any(len(p) != 2 or not all(-1 <= v <= 2 for v in p) for p in points):
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
    # 合わせる 4 点(PhotoAlignmentWrite と同じ形)。手で合わせていればその点、
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


class PhotoUploadRead(ResponseModel):
    photo: EndPhotoRead
    # 元の写真を PUT で送る先と、付けるヘッダー。upload_url の形は original_url と同じ決まり。
    # 送る本文は、受け付けで渡した content_length と同じ大きさにする(違えば S3 が 403 で弾く)
    upload_url: str
    upload_headers: dict[str, str]
