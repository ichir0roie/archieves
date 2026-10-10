from datetime import date

from app.schemas.base import ResponseModel
from app.schemas.statistics import ScoreStatistics
from app.schemas.user import UserRead


class UserProfile(ResponseModel):
    """A user's public profile: basic info plus their activity over a recent period."""

    user: UserRead
    period_start: date
    period_end: date
    rounds: ScoreStatistics
    ends: ScoreStatistics
    points: ScoreStatistics
