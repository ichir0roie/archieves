from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import statistics as statistics_crud
from app.crud.statistics import GameKindFilter
from app.db import User
from app.schemas.statistics import (
    EndScoreSummary,
    GameKindOptions,
    RoundScoreSummary,
    ScoreStatistics,
)

# 本人の記録の集計。他人の集計はプロフィール(GET /public/users/{user_id}/profile)、
# ランキングは GET /public/ranking が返す
router = APIRouter()


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
    me: User = Depends(deps.get_reader),
    s: Session = Depends(deps.get_session),
) -> GameKindOptions:
    """統計の絞り込みに選べる種別の値。"""
    return statistics_crud.game_kind_options(s, user_id=me.id)


@router.get("/rounds", response_model=list[RoundScoreSummary])
def list_round_scores(
    start: date | None = None,
    end: date | None = None,
    me: User = Depends(deps.get_reader),
    kind: GameKindFilter = Depends(_game_kind),
    s: Session = Depends(deps.get_session),
) -> list[RoundScoreSummary]:
    """Per-round score aggregation (total/average of its points), optionally
    filtered to a period."""
    return statistics_crud.list_round_scores(
        s, start=start, end=end, user_id=me.id, kind=kind
    )


@router.get("/rounds/summary", response_model=ScoreStatistics)
def get_round_score_statistics(
    start: date | None = None,
    end: date | None = None,
    me: User = Depends(deps.get_reader),
    kind: GameKindFilter = Depends(_game_kind),
    s: Session = Depends(deps.get_session),
) -> ScoreStatistics:
    """Min/max/average/median of round totals within a period."""
    return statistics_crud.round_score_statistics(
        s, start=start, end=end, user_id=me.id, kind=kind
    )


@router.get("/ends", response_model=list[EndScoreSummary])
def list_end_scores(
    start: date | None = None,
    end: date | None = None,
    me: User = Depends(deps.get_reader),
    kind: GameKindFilter = Depends(_game_kind),
    s: Session = Depends(deps.get_session),
) -> list[EndScoreSummary]:
    """Per-end score aggregation (total/average of its points), optionally
    filtered to a period."""
    return statistics_crud.list_end_scores(
        s, start=start, end=end, user_id=me.id, kind=kind
    )


@router.get("/ends/summary", response_model=ScoreStatistics)
def get_end_score_statistics(
    start: date | None = None,
    end: date | None = None,
    me: User = Depends(deps.get_reader),
    kind: GameKindFilter = Depends(_game_kind),
    s: Session = Depends(deps.get_session),
) -> ScoreStatistics:
    """Min/max/average/median of end totals within a period."""
    return statistics_crud.end_score_statistics(
        s, start=start, end=end, user_id=me.id, kind=kind
    )


@router.get("/points/summary", response_model=ScoreStatistics)
def get_point_score_statistics(
    start: date | None = None,
    end: date | None = None,
    me: User = Depends(deps.get_reader),
    kind: GameKindFilter = Depends(_game_kind),
    s: Session = Depends(deps.get_session),
) -> ScoreStatistics:
    """Min/max/average/median of individual point (arrow) scores within a period."""
    return statistics_crud.point_score_statistics(
        s, start=start, end=end, user_id=me.id, kind=kind
    )
