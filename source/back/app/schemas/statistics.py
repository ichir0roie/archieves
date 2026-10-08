from datetime import date
from enum import StrEnum

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


class GameKindOptions(ResponseModel):
    """統計の絞り込みに選べる種別の値(利用者の記録にあるもの)。"""

    bow_types: list[str]
    distances_m: list[int]
    target_types: list[str]
    end_sizes: list[int]
    round_sizes: list[int]
    game_sizes: list[int]


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


class RankingMetric(StrEnum):
    """ランキングの順位を決める値。"""

    TOTAL_SCORE = "total_score"
    AVERAGE_ROUND_SCORE = "average_round_score"
    AVERAGE_POINT_SCORE = "average_point_score"


class UserRanking(ResponseModel):
    """metric の値が高い順の、利用者の順位。"""

    rank: int
    user: UserRead
    # metric の値。total_score なら合計点、平均なら平均点。
    value: float
    round_count: int
    arrow_count: int
