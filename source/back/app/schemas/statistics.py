from datetime import date

from app.schemas.base import ResponseModel
from app.schemas.user import UserRead


class ScoreStatistics(ResponseModel):
    """Min/max/average/median over a set of scores within a period."""

    count: int
    total: int
    min: int | None = None
    max: int | None = None
    average: float | None = None
    median: float | None = None


class RoundScoreSummary(ResponseModel):
    round_id: int
    game_id: int
    number: int
    recorded_at: date
    arrow_count: int
    total_score: int
    average_score: float | None = None


class EndScoreSummary(ResponseModel):
    end_id: int
    round_id: int
    number: int
    recorded_at: date
    arrow_count: int
    total_score: int
    average_score: float | None = None


class UserRanking(ResponseModel):
    """A user's position in a ranking of average game score, high to low."""

    rank: int
    user: UserRead
    game_count: int
    average_score: float
