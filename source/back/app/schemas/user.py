from pydantic import BaseModel, Field, field_validator

from app.core.names import MAX_NICKNAME_LENGTH, MAX_USER_NAME_LENGTH
from app.core.visibility import Visibility
from app.schemas.base import ResponseModel


class UserBase(BaseModel):
    name: str
    nickname: str | None = None
    organization_id: int | None = None
    region_id: int | None = None


class UserCreate(UserBase):
    # 長さは db の列と揃え、超えたら 500 でなく 422 にする
    # (応答の UserBase には付けない。今ある行が合わずに読めなくなるため)
    name: str = Field(min_length=1, max_length=MAX_USER_NAME_LENGTH)
    nickname: str | None = Field(default=None, max_length=MAX_NICKNAME_LENGTH)


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=MAX_USER_NAME_LENGTH)
    nickname: str | None = Field(default=None, max_length=MAX_NICKNAME_LENGTH)
    organization_id: int | None = None
    region_id: int | None = None
    profile_visibility: Visibility | None = None
    ranking_visibility: Visibility | None = None
    score_visibility: Visibility | None = None
    diary_visibility: Visibility | None = None

    # 省略はそのまま、null は弾く(列は NOT NULL で、null を書くと 500 になる)
    @field_validator(
        "name",
        "profile_visibility",
        "ranking_visibility",
        "score_visibility",
        "diary_visibility",
    )
    @classmethod
    def _reject_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("must not be null")
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
