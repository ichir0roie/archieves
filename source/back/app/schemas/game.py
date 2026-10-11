from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.core.bow_types import BOW_TYPE_MAX_LENGTH
from app.core.scoring import (
    MAX_ARROW_DIAMETER_MM,
    MAX_DISTANCE_M,
    MAX_END_SIZE,
    MAX_GAME_SIZE,
    MAX_ROUND_SIZE,
    MIN_ARROW_DIAMETER_MM,
    MISS_SCORE,
    X_SCORE,
)
from app.core.target_types import check_target_type
from app.schemas.base import ResponseModel


def _reject_null(value: object) -> object:
    """XUpdate の、NOT NULL の列に書く欄に付ける。省略はそのまま、null は弾く。

    null を通すと、列に書くときに 500 になる。
    """
    if value is None:
        raise ValueError("must not be null")
    return value


class GameFields(BaseModel):
    """ゲームの持ち主以外の欄。読み書きで共通。"""

    recorded_at: date
    game_size: int | None = None
    # プリセット(BowType)以外の弓は自由入力の名前で持つ。ランキングの絞り込みは BowType だけ
    bow_type: str | None = Field(default=None, min_length=1, max_length=BOW_TYPE_MAX_LENGTH)
    # 矢の直径(mm)。null は既定の太さ
    arrow_diameter_mm: int | None = Field(
        default=None, ge=MIN_ARROW_DIAMETER_MM, le=MAX_ARROW_DIAMETER_MM
    )
    # インサイドアウト: 矢が帯に完全に入らなければ、その帯の点にしない(線にかかれば低い方)
    all_in: bool = False
    # あとから入力: 日付を決めて入れたゲーム。中の記録の日付・時刻をゲームの日付にそろえる
    backfilled: bool = False


class GameWriteFields(GameFields):
    """ゲームを書く要求(GameCreate・schemas/game_sheet.py の GameSheetWrite)に共通の欄。"""

    game_size: int | None = Field(default=None, ge=1, le=MAX_GAME_SIZE)


class GameBase(GameFields):
    user_id: int


class GameCreate(GameWriteFields):
    user_id: int


class GameUpdate(BaseModel):
    user_id: int | None = None
    recorded_at: date | None = None
    game_size: int | None = Field(default=None, ge=1, le=MAX_GAME_SIZE)
    bow_type: str | None = Field(default=None, min_length=1, max_length=BOW_TYPE_MAX_LENGTH)
    arrow_diameter_mm: int | None = Field(
        default=None, ge=MIN_ARROW_DIAMETER_MM, le=MAX_ARROW_DIAMETER_MM
    )
    all_in: bool | None = None
    backfilled: bool | None = None

    _reject_null = field_validator(
        "user_id",
        "recorded_at",
        "all_in",
        "backfilled",
    )(_reject_null)


class GameRead(GameBase, ResponseModel):
    id: int
    deleted_at: date | None = None


class GameScoreSummary(ResponseModel):
    """スコア一覧の一行に出す、ゲームの点数の集計。矢のないゲームは平均が None。"""

    game_id: int
    total_score: int
    end_average: float | None = None
    point_average: float | None = None


def _validate_target_type(target_type: str | None) -> str | None:
    if target_type is not None:
        check_target_type(target_type)
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


class RoundWriteFields(RoundBase):
    """ラウンドを書く要求(RoundCreate・schemas/game_sheet.py の RoundSheetWrite)に共通の欄。"""

    number: int = Field(ge=1)
    end_size: int = Field(ge=1, le=MAX_END_SIZE)
    round_size: int | None = Field(default=None, ge=1, le=MAX_ROUND_SIZE)
    distance_m: int = Field(ge=1, le=MAX_DISTANCE_M)


class RoundCreate(RoundWriteFields):
    _validate_target_type = field_validator("target_type")(_validate_target_type)


class RoundUpdate(BaseModel):
    number: int | None = Field(default=None, ge=1)
    recorded_at: date | None = None
    end_size: int | None = Field(default=None, ge=1, le=MAX_END_SIZE)
    round_size: int | None = Field(default=None, ge=1, le=MAX_ROUND_SIZE)
    distance_m: int | None = Field(default=None, ge=1, le=MAX_DISTANCE_M)
    target_type: str | None = None

    _validate_target_type = field_validator("target_type")(_validate_target_type)
    _reject_null = field_validator(
        "number",
        "recorded_at",
        "end_size",
        "distance_m",
        "target_type",
    )(_reject_null)


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

    _reject_null = field_validator(
        "number",
        "recorded_at",
    )(_reject_null)


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
    # 矢を記録した時刻(入力の画面で付ける)。無い記録は null
    shot_at: datetime | None = None


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
    shot_at: datetime | None = None

    _reject_null = field_validator(
        "number",
        "score",
        "x",
        "y",
        "recorded_at",
    )(_reject_null)


class PointRead(PointBase, ResponseModel):
    id: int
    end_id: int
    user_id: int
    # x/y converted to real-world centimeters from the round's target size;
    # null when the target size couldn't be resolved.
    x_cm: float | None = None
    y_cm: float | None = None
