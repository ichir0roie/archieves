from datetime import datetime

from pydantic import BaseModel, Field

from app.core.access_token import DEFAULT_EXPIRES_IN_DAYS, MAX_EXPIRES_IN_DAYS, MAX_NAME_LENGTH
from app.schemas.base import ResponseModel


class AccessTokenCreate(BaseModel):
    # どこに渡したかを本人が見分けるための名前(例: 「Claude Code(自宅の PC)」)
    name: str = Field(min_length=1, max_length=MAX_NAME_LENGTH)
    expires_in_days: int = Field(default=DEFAULT_EXPIRES_IN_DAYS, ge=1, le=MAX_EXPIRES_IN_DAYS)


class AccessTokenRead(ResponseModel):
    id: int
    name: str
    # 平文の頭。どのトークンかを見分けるだけで、これでは使えない
    token_prefix: str
    created_at: datetime
    expires_at: datetime


class AccessTokenCreated(AccessTokenRead):
    """発行したときだけ返す。token(平文)は二度と読めない。"""

    token: str
