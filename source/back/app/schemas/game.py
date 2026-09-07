from datetime import date

from pydantic import BaseModel, ConfigDict


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


class RoundBase(BaseModel):
    number: int
    recorded_at: date
    end_size: int
    round_size: int | None = None
    distance_m: int
    target_type: str


class RoundCreate(RoundBase):
    pass


class RoundUpdate(BaseModel):
    number: int | None = None
    recorded_at: date | None = None
    end_size: int | None = None
    round_size: int | None = None
    distance_m: int | None = None
    target_type: str | None = None


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
