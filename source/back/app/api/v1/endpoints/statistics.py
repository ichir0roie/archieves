from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import statistics as statistics_crud
from app.schemas.statistics import (
    EndScoreSummary,
    RoundScoreSummary,
    ScoreStatistics,
    UserRanking,
)

router = APIRouter()


@router.get("/rounds", response_model=list[RoundScoreSummary])
def list_round_scores(
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    db: Session = Depends(deps.get_session),
) -> list[RoundScoreSummary]:
    """Per-round score aggregation (total/average of its points), optionally
    filtered to a period and/or a user."""
    return statistics_crud.list_round_scores(db, start=start, end=end, user_id=user_id)


@router.get("/rounds/summary", response_model=ScoreStatistics)
def get_round_score_statistics(
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    db: Session = Depends(deps.get_session),
) -> ScoreStatistics:
    """Min/max/average/median of round totals within a period."""
    return statistics_crud.round_score_statistics(db, start=start, end=end, user_id=user_id)


@router.get("/ends", response_model=list[EndScoreSummary])
def list_end_scores(
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    db: Session = Depends(deps.get_session),
) -> list[EndScoreSummary]:
    """Per-end score aggregation (total/average of its points), optionally
    filtered to a period and/or a user."""
    return statistics_crud.list_end_scores(db, start=start, end=end, user_id=user_id)


@router.get("/ends/summary", response_model=ScoreStatistics)
def get_end_score_statistics(
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    db: Session = Depends(deps.get_session),
) -> ScoreStatistics:
    """Min/max/average/median of end totals within a period."""
    return statistics_crud.end_score_statistics(db, start=start, end=end, user_id=user_id)


@router.get("/points/summary", response_model=ScoreStatistics)
def get_point_score_statistics(
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    db: Session = Depends(deps.get_session),
) -> ScoreStatistics:
    """Min/max/average/median of individual point (arrow) scores within a period."""
    return statistics_crud.point_score_statistics(db, start=start, end=end, user_id=user_id)


@router.get("/ranking", response_model=list[UserRanking])
def list_user_ranking(
    organization_id: int | None = None,
    region_id: int | None = None,
    start: date | None = None,
    end: date | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(deps.get_session),
) -> list[UserRanking]:
    """Users ranked by average game score, high to low, optionally filtered
    by organization, region, and/or period."""
    return statistics_crud.list_user_ranking(
        db,
        organization_id=organization_id,
        region_id=region_id,
        start=start,
        end=end,
        skip=skip,
        limit=limit,
    )
