from pydantic import BaseModel, field_validator

from app.core.visibility import Visibility
from app.schemas.base import ResponseModel


class UserBase(BaseModel):
    name: str
    nickname: str | None = None
    organization_id: int | None = None
    region_id: int | None = None


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    name: str | None = None
    nickname: str | None = None
    organization_id: int | None = None
    region_id: int | None = None
    profile_visibility: Visibility | None = None
    ranking_visibility: Visibility | None = None
    score_visibility: Visibility | None = None
    diary_visibility: Visibility | None = None

    # 省略はそのまま、null は弾く(列は NOT NULL で、null を書くと 500 になる)
    @field_validator(
        "profile_visibility",
        "ranking_visibility",
        "score_visibility",
        "diary_visibility",
    )
    @classmethod
    def _reject_null_visibility(cls, value: Visibility | None) -> Visibility:
        if value is None:
            raise ValueError("visibility must not be null")
        return value


class MeRead(UserBase, ResponseModel):
    """本人の行。sub・管理者かどうか・公開範囲は本人にだけ返す。

    他人に見せる形は schemas/profile.py の PublicUserRead。
    """

    id: int
    sub: str | None = None
    is_admin: bool
    profile_visibility: Visibility
    ranking_visibility: Visibility
    score_visibility: Visibility
    diary_visibility: Visibility
