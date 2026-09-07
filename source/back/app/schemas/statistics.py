from datetime import date

from pydantic import BaseModel

from app.schemas.user import UserRead


class ScoreStatistics(BaseModel):
    """Min/max/average/median over a set of scores within a period."""

    count: int
    total: int
    min: int | None = None
    max: int | None = None
    average: float | None = None
    median: float | None = None


class RoundScoreSummary(BaseModel):
    round_id: int
    game_id: int
    number: int
    recorded_at: date
    arrow_count: int
    total_score: int
    average_score: float | None = None


class EndScoreSummary(BaseModel):
    end_id: int
    round_id: int
    number: int
    recorded_at: date
    arrow_count: int
    total_score: int
    average_score: float | None = None


class UserRanking(BaseModel):
    """A user's position in a ranking of average game score, high to low."""

    rank: int
    user: UserRead
    game_count: int
    average_score: float
