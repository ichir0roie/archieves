from datetime import date

from pydantic import BaseModel, Field, field_validator

from app.core.bow_types import BOW_TYPE_MAX_LENGTH
from app.core.scoring import (
    MAX_DISTANCE_M,
    MAX_END_SIZE,
    MAX_GAME_SIZE,
    MAX_ROUND_SIZE,
    MISS_SCORE,
    X_SCORE,
)
from app.core.target_types import TARGET_TYPE_IDS
from app.schemas.base import ResponseModel


class GameBase(BaseModel):
    user_id: int
    recorded_at: date
    game_size: int | None = None
    # プリセット(BowType)以外の弓は自由入力の名前で持つ。ランキングの絞り込みは BowType だけ
    bow_type: str | None = Field(default=None, min_length=1, max_length=BOW_TYPE_MAX_LENGTH)


class GameCreate(GameBase):
    game_size: int | None = Field(default=None, ge=1, le=MAX_GAME_SIZE)


class GameUpdate(BaseModel):
    user_id: int | None = None
    recorded_at: date | None = None
    game_size: int | None = Field(default=None, ge=1, le=MAX_GAME_SIZE)
    bow_type: str | None = Field(default=None, min_length=1, max_length=BOW_TYPE_MAX_LENGTH)


class GameRead(GameBase, ResponseModel):
    id: int
    deleted_at: date | None = None


class GameScoreSummary(ResponseModel):
    """スコア一覧の一行に出す、ゲームの点数の集計。矢のないゲームは平均が None。"""

    game_id: int
    total_score: int
    end_average: float | None = None
    point_average: float | None = None


def _validate_target_type(target_type: str) -> str:
    if target_type not in TARGET_TYPE_IDS:
        raise ValueError(f"target_type must be one of {TARGET_TYPE_IDS}")
    return target_type


class RoundBase(BaseModel):
    number: int
    recorded_at: date
    end_size: int
    round_size: int | None = None
    distance_m: int
    # Not validated here: RoundRead also extends this, and legacy/imported
    # rounds can carry a target_type outside TARGET_TYPE_IDS (see
    # app.services.legacy_import). Validated on write in RoundCreate/RoundUpdate.
    target_type: str


class RoundCreate(RoundBase):
    number: int = Field(ge=1)
    end_size: int = Field(ge=1, le=MAX_END_SIZE)
    round_size: int | None = Field(default=None, ge=1, le=MAX_ROUND_SIZE)
    distance_m: int = Field(ge=1, le=MAX_DISTANCE_M)

    _validate_target_type = field_validator("target_type")(_validate_target_type)


class RoundUpdate(BaseModel):
    number: int | None = Field(default=None, ge=1)
    recorded_at: date | None = None
    end_size: int | None = Field(default=None, ge=1, le=MAX_END_SIZE)
    round_size: int | None = Field(default=None, ge=1, le=MAX_ROUND_SIZE)
    distance_m: int | None = Field(default=None, ge=1, le=MAX_DISTANCE_M)
    target_type: str | None = None

    _validate_target_type = field_validator("target_type")(
        lambda v: _validate_target_type(v) if v is not None else v
    )


class RoundRead(RoundBase, ResponseModel):
    id: int
    game_id: int
    user_id: int
    deleted_at: date | None = None


class EndBase(BaseModel):
    number: int
    recorded_at: date


class EndCreate(EndBase):
    number: int = Field(ge=1)


class EndUpdate(BaseModel):
    number: int | None = Field(default=None, ge=1)
    recorded_at: date | None = None


class EndRead(EndBase, ResponseModel):
    id: int
    round_id: int
    user_id: int


class PointBase(BaseModel):
    number: int
    score: int
    x: float
    y: float
    recorded_at: date


class PointCreate(PointBase):
    number: int = Field(ge=1)
    score: int = Field(ge=MISS_SCORE, le=X_SCORE)
    # Fraction (0-1, top-left origin) of the touch-target input area the
    # arrow was tapped in; (0, 0) means "no position recorded".
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class PointUpdate(BaseModel):
    number: int | None = Field(default=None, ge=1)
    score: int | None = Field(default=None, ge=MISS_SCORE, le=X_SCORE)
    x: float | None = Field(default=None, ge=0, le=1)
    y: float | None = Field(default=None, ge=0, le=1)
    recorded_at: date | None = None


class PointRead(PointBase, ResponseModel):
    id: int
    end_id: int
    user_id: int
    # x/y converted to real-world centimeters from the round's target size;
    # null when the target size couldn't be resolved.
    x_cm: float | None = None
    y_cm: float | None = None
