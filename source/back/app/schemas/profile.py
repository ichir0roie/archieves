from datetime import date

from pydantic import BaseModel

from app.schemas.game import MatchSummary
from app.schemas.statistics import ScoreStatistics
from app.schemas.user import UserRead


class UserProfile(BaseModel):
    """A user's public profile: basic info plus their activity over a recent period."""

    user: UserRead
    period_start: date
    period_end: date
    rounds: ScoreStatistics
    ends: ScoreStatistics
    points: ScoreStatistics
    matches: list[MatchSummary]
