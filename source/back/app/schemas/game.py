from datetime import date

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.target_types import TARGET_TYPE_IDS


class GameBase(BaseModel):
    user_id: int
    recorded_at: date
    game_size: int | None = None


class GameCreate(GameBase):
    pass


class GameUpdate(BaseModel):
    user_id: int | None = None
    recorded_at: date | None = None
    game_size: int | None = None


class GameRead(GameBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    deleted_at: date | None = None


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
    _validate_target_type = field_validator("target_type")(_validate_target_type)


class RoundUpdate(BaseModel):
    number: int | None = None
    recorded_at: date | None = None
    end_size: int | None = None
    round_size: int | None = None
    distance_m: int | None = None
    target_type: str | None = None

    _validate_target_type = field_validator("target_type")(
        lambda v: _validate_target_type(v) if v is not None else v
    )


class RoundRead(RoundBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    game_id: int
    user_id: int
    deleted_at: date | None = None


class EndBase(BaseModel):
    number: int
    recorded_at: date


class EndCreate(EndBase):
    pass


class EndUpdate(BaseModel):
    number: int | None = None
    recorded_at: date | None = None


class EndRead(EndBase):
    model_config = ConfigDict(from_attributes=True)

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
    pass


class PointUpdate(BaseModel):
    number: int | None = None
    score: int | None = None
    x: float | None = None
    y: float | None = None
    recorded_at: date | None = None


class PointRead(PointBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    end_id: int
    user_id: int
    # x/y converted to real-world centimeters from the round's target size;
    # null when the target size couldn't be resolved.
    x_cm: float | None = None
    y_cm: float | None = None


class MatchBase(BaseModel):
    name: str
    link: str | None = None


class MatchCreate(MatchBase):
    pass


class MatchUpdate(BaseModel):
    name: str | None = None
    link: str | None = None


class MatchRead(MatchBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    game_id: int
    user_id: int


class MatchSummary(MatchBase):
    """A match joined with its game's date, for recent-activity displays."""

    id: int
    game_id: int
    user_id: int
    recorded_at: date
