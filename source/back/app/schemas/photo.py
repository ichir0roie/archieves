from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.base import ResponseModel


class PhotoUploadCreate(BaseModel):
    # app/core/photos.py の PHOTO_EXTENSIONS。ほかの形式はフロントが JPEG に直してから送る
    content_type: Literal["image/jpeg", "image/png", "image/webp"]


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
    # 元の写真を PUT で送る先と、付けるヘッダー。upload_url の形は original_url と同じ決まり
    upload_url: str
    upload_headers: dict[str, str]
