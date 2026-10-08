from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.core.bow_types import BowType
from app.crud import statistics as statistics_crud
from app.crud.statistics import GameKindFilter
from app.db import User
from app.schemas.statistics import (
    EndScoreSummary,
    GameKindOptions,
    RankingMetric,
    RoundScoreSummary,
    ScoreStatistics,
    UserRanking,
)

router = APIRouter()


def _target_user_id(me: User, user_id: int | None) -> int:
    # 他人の統計は読めてよい(プロフィールで見せる)。
    # 省略したときだけ本人に絞り、全員分の集計は返さない
    return me.id if user_id is None else user_id


def _game_kind(
    bow_type: str | None = None,
    distance_m: int | None = None,
    target_type: str | None = None,
    end_size: int | None = None,
    round_size: int | None = None,
    game_size: int | None = None,
) -> GameKindFilter:
    return GameKindFilter(
        bow_type=bow_type,
        distance_m=distance_m,
        target_type=target_type,
        end_size=end_size,
        round_size=round_size,
        game_size=game_size,
    )


@router.get("/game-kinds", response_model=GameKindOptions)
def get_game_kind_options(
    user_id: int | None = None,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> GameKindOptions:
    """統計の絞り込みに選べる種別の値。"""
    return statistics_crud.game_kind_options(s, user_id=_target_user_id(me, user_id))


@router.get("/rounds", response_model=list[RoundScoreSummary])
def list_round_scores(
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    me: User = Depends(deps.get_me),
    kind: GameKindFilter = Depends(_game_kind),
    s: Session = Depends(deps.get_session),
) -> list[RoundScoreSummary]:
    """Per-round score aggregation (total/average of its points), optionally
    filtered to a period and/or a user."""
    return statistics_crud.list_round_scores(
        s, start=start, end=end, user_id=_target_user_id(me, user_id), kind=kind
    )


@router.get("/rounds/summary", response_model=ScoreStatistics)
def get_round_score_statistics(
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    me: User = Depends(deps.get_me),
    kind: GameKindFilter = Depends(_game_kind),
    s: Session = Depends(deps.get_session),
) -> ScoreStatistics:
    """Min/max/average/median of round totals within a period."""
    return statistics_crud.round_score_statistics(
        s, start=start, end=end, user_id=_target_user_id(me, user_id), kind=kind
    )


@router.get("/ends", response_model=list[EndScoreSummary])
def list_end_scores(
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    me: User = Depends(deps.get_me),
    kind: GameKindFilter = Depends(_game_kind),
    s: Session = Depends(deps.get_session),
) -> list[EndScoreSummary]:
    """Per-end score aggregation (total/average of its points), optionally
    filtered to a period and/or a user."""
    return statistics_crud.list_end_scores(
        s, start=start, end=end, user_id=_target_user_id(me, user_id), kind=kind
    )


@router.get("/ends/summary", response_model=ScoreStatistics)
def get_end_score_statistics(
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    me: User = Depends(deps.get_me),
    kind: GameKindFilter = Depends(_game_kind),
    s: Session = Depends(deps.get_session),
) -> ScoreStatistics:
    """Min/max/average/median of end totals within a period."""
    return statistics_crud.end_score_statistics(
        s, start=start, end=end, user_id=_target_user_id(me, user_id), kind=kind
    )


@router.get("/points/summary", response_model=ScoreStatistics)
def get_point_score_statistics(
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    me: User = Depends(deps.get_me),
    kind: GameKindFilter = Depends(_game_kind),
    s: Session = Depends(deps.get_session),
) -> ScoreStatistics:
    """Min/max/average/median of individual point (arrow) scores within a period."""
    return statistics_crud.point_score_statistics(
        s, start=start, end=end, user_id=_target_user_id(me, user_id), kind=kind
    )


@router.get("/ranking", response_model=list[UserRanking])
def list_user_ranking(
    metric: RankingMetric = RankingMetric.TOTAL_SCORE,
    organization_id: int | None = None,
    region_id: int | None = None,
    bow_type: BowType | None = None,
    distance_m: int | None = None,
    start: date | None = None,
    end: date | None = None,
    skip: int = 0,
    limit: int = 100,
    s: Session = Depends(deps.get_session),
) -> list[UserRanking]:
    """Users ranked by total score, average round score or average point
    score, high to low, optionally filtered by bow type, distance,
    organization, region, and/or period."""
    return statistics_crud.list_user_ranking(
        s,
        metric=metric,
        organization_id=organization_id,
        region_id=region_id,
        bow_type=bow_type,
        distance_m=distance_m,
        start=start,
        end=end,
        skip=skip,
        limit=limit,
    )
