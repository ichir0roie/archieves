from dataclasses import dataclass
from datetime import date

from sqlalchemy import ColumnElement, Select, func, select
from sqlalchemy.orm import Session

from app.core.bow_types import BowType
from app.core.scoring import scored_value_column
from app.core.visibility import can_view_profile
from app.crud import user as user_crud
from app.db import End, Game, Point, Round, User
from app.schemas.statistics import (
    EndScoreSummary,
    GameKindOptions,
    RankedUser,
    RankingMetric,
    RoundScoreSummary,
    ScoreStatistics,
    UserRanking,
)


@dataclass(frozen=True)
class GameKindFilter:
    """統計を絞るゲームの種別。None の欄は絞らない。"""

    bow_type: str | None = None
    distance_m: int | None = None
    target_type: str | None = None
    end_size: int | None = None
    round_size: int | None = None
    game_size: int | None = None


def _where_kind(
    stmt: Select,
    kind: GameKindFilter | None,
    game_ids: Select[tuple[int]] | None = None,
) -> Select:
    """Game と Round を join 済みの stmt を種別と、game_ids(Game.id を返す select)で絞る。"""
    if game_ids is not None:
        stmt = stmt.where(Game.id.in_(game_ids))
    if kind is None:
        return stmt
    conditions = [
        (Game.bow_type, kind.bow_type),
        (Round.distance_m, kind.distance_m),
        (Round.target_type, kind.target_type),
        (Round.end_size, kind.end_size),
        (Round.round_size, kind.round_size),
        (Game.game_size, kind.game_size),
    ]
    for column, value in conditions:
        if value is not None:
            stmt = stmt.where(column == value)
    return stmt


def _statistics(s: Session, value: ColumnElement) -> ScoreStatistics:
    """value を集めた件数・合計・最小・最大・平均・中央値。集計は db に任せる。"""
    count, total, minimum, maximum, average, median = s.execute(
        select(
            func.count(value),
            func.coalesce(func.sum(value), 0),
            func.min(value),
            func.max(value),
            func.avg(value),
            func.percentile_cont(0.5).within_group(value),
        )
    ).one()
    return ScoreStatistics(
        count=count,
        total=total,
        min=minimum,
        max=maximum,
        average=average,
        median=median,
    )


def _round_totals(
    start: date | None,
    end: date | None,
    user_id: int | None,
    kind: GameKindFilter | None,
    game_ids: Select[tuple[int]] | None = None,
) -> Select:
    stmt = (
        select(
            Round.id,
            Round.game_id,
            Round.number,
            Round.recorded_at,
            func.count(Point.id).label("arrow_count"),
            func.coalesce(func.sum(scored_value_column(Point.score)), 0).label("total_score"),
        )
        .join(Game, Game.id == Round.game_id)
        .outerjoin(End, End.round_id == Round.id)
        .outerjoin(Point, Point.end_id == End.id)
        .where(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
        .group_by(Round.id)
        .order_by(Round.recorded_at, Round.id)
    )
    if start is not None:
        stmt = stmt.where(Round.recorded_at >= start)
    if end is not None:
        stmt = stmt.where(Round.recorded_at <= end)
    if user_id is not None:
        stmt = stmt.where(Game.user_id == user_id)
    return _where_kind(stmt, kind, game_ids)


def _end_totals(
    start: date | None,
    end: date | None,
    user_id: int | None,
    kind: GameKindFilter | None,
    game_ids: Select[tuple[int]] | None = None,
) -> Select:
    stmt = (
        select(
            End.id,
            End.round_id,
            End.number,
            End.recorded_at,
            func.count(Point.id).label("arrow_count"),
            func.coalesce(func.sum(scored_value_column(Point.score)), 0).label("total_score"),
        )
        .join(Round, Round.id == End.round_id)
        .join(Game, Game.id == Round.game_id)
        .outerjoin(Point, Point.end_id == End.id)
        .where(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
        .group_by(End.id)
        .order_by(End.recorded_at, End.id)
    )
    if start is not None:
        stmt = stmt.where(End.recorded_at >= start)
    if end is not None:
        stmt = stmt.where(End.recorded_at <= end)
    if user_id is not None:
        stmt = stmt.where(Game.user_id == user_id)
    return _where_kind(stmt, kind, game_ids)


def list_round_scores(
    s: Session,
    *,
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    kind: GameKindFilter | None = None,
) -> list[RoundScoreSummary]:
    return [
        RoundScoreSummary(
            round_id=row.id,
            game_id=row.game_id,
            number=row.number,
            recorded_at=row.recorded_at,
            arrow_count=row.arrow_count,
            total_score=row.total_score,
            average_score=(row.total_score / row.arrow_count) if row.arrow_count else None,
        )
        for row in s.execute(_round_totals(start, end, user_id, kind))
    ]


def list_end_scores(
    s: Session,
    *,
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    kind: GameKindFilter | None = None,
) -> list[EndScoreSummary]:
    return [
        EndScoreSummary(
            end_id=row.id,
            round_id=row.round_id,
            number=row.number,
            recorded_at=row.recorded_at,
            arrow_count=row.arrow_count,
            total_score=row.total_score,
            average_score=(row.total_score / row.arrow_count) if row.arrow_count else None,
        )
        for row in s.execute(_end_totals(start, end, user_id, kind))
    ]


def round_score_statistics(
    s: Session,
    *,
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    kind: GameKindFilter | None = None,
    game_ids: Select[tuple[int]] | None = None,
) -> ScoreStatistics:
    totals = _round_totals(start, end, user_id, kind, game_ids).order_by(None).subquery()
    return _statistics(s, totals.c.total_score)


def end_score_statistics(
    s: Session,
    *,
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    kind: GameKindFilter | None = None,
    game_ids: Select[tuple[int]] | None = None,
) -> ScoreStatistics:
    totals = _end_totals(start, end, user_id, kind, game_ids).order_by(None).subquery()
    return _statistics(s, totals.c.total_score)


def point_score_statistics(
    s: Session,
    *,
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    kind: GameKindFilter | None = None,
    game_ids: Select[tuple[int]] | None = None,
) -> ScoreStatistics:
    scores = (
        select(scored_value_column(Point.score).label("score"))
        .join(End, End.id == Point.end_id)
        .join(Round, Round.id == End.round_id)
        .join(Game, Game.id == Round.game_id)
        .where(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
    )
    if start is not None:
        scores = scores.where(Point.recorded_at >= start)
    if end is not None:
        scores = scores.where(Point.recorded_at <= end)
    if user_id is not None:
        scores = scores.where(Game.user_id == user_id)
    scores = _where_kind(scores, kind, game_ids)
    return _statistics(s, scores.subquery().c.score)


def game_kind_options(s: Session, *, user_id: int) -> GameKindOptions:
    """利用者の記録にある種別の値。統計の絞り込みの選択肢にする。"""

    def distinct(column) -> list:
        stmt = (
            select(column)
            .select_from(Round)
            .join(Game, Game.id == Round.game_id)
            .where(
                Round.deleted_at.is_(None),
                Game.deleted_at.is_(None),
                Game.user_id == user_id,
                column.is_not(None),
            )
            .distinct()
            .order_by(column)
        )
        return list(s.scalars(stmt))

    return GameKindOptions(
        bow_types=distinct(Game.bow_type),
        distances_m=distinct(Round.distance_m),
        target_types=distinct(Round.target_type),
        end_sizes=distinct(Round.end_size),
        round_sizes=distinct(Round.round_size),
        game_sizes=distinct(Game.game_size),
    )


def list_user_ranking(
    s: Session,
    *,
    viewer: User,
    metric: RankingMetric = RankingMetric.TOTAL_SCORE,
    organization_id: int | None = None,
    region_id: int | None = None,
    bow_type: BowType | None = None,
    distance_m: int | None = None,
    start: date | None = None,
    end: date | None = None,
    skip: int = 0,
    limit: int = 100,
) -> list[UserRanking]:
    """期間・種目(弓の種類・距離)・組織・地域の中で、metric の値が高い順の利用者。

    ランキングを viewer に公開している利用者(全体公開か、同じ組織への公開)だけを載せる。
    非公開なら viewer 本人も載らない。矢が一本も無いラウンドは、どの metric にも数えない。
    """
    round_scores = (
        select(
            Game.user_id,
            Round.id.label("round_id"),
            func.count(Point.id).label("arrow_count"),
            func.sum(scored_value_column(Point.score)).label("total_score"),
        )
        .join(Round, Round.game_id == Game.id)
        .join(End, End.round_id == Round.id)
        .join(Point, Point.end_id == End.id)
        .where(Game.deleted_at.is_(None), Round.deleted_at.is_(None))
        .group_by(Game.user_id, Round.id)
    )
    if start is not None:
        round_scores = round_scores.where(Game.recorded_at >= start)
    if end is not None:
        round_scores = round_scores.where(Game.recorded_at <= end)
    if bow_type is not None:
        round_scores = round_scores.where(Game.bow_type == bow_type)
    if distance_m is not None:
        round_scores = round_scores.where(Round.distance_m == distance_m)
    round_scores = round_scores.subquery()

    arrow_count = func.sum(round_scores.c.arrow_count)
    total_score = func.sum(round_scores.c.total_score)
    value = {
        RankingMetric.TOTAL_SCORE: total_score,
        RankingMetric.AVERAGE_ROUND_SCORE: func.avg(round_scores.c.total_score),
        RankingMetric.AVERAGE_POINT_SCORE: total_score / arrow_count,
    }[metric]
    stmt = (
        select(User, value, func.count(round_scores.c.round_id), arrow_count)
        .join(round_scores, round_scores.c.user_id == User.id)
        .where(
            User.deleted_at.is_(None),
            user_crud.visible_condition(viewer, User.ranking_visibility),
        )
        .group_by(User.id)
        .order_by(value.desc(), User.id)
        .offset(skip)
        .limit(limit)
    )
    if organization_id is not None:
        stmt = stmt.where(User.organization_id == organization_id)
    if region_id is not None:
        stmt = stmt.where(User.region_id == region_id)

    return [
        UserRanking(
            rank=skip + index + 1,
            user=RankedUser(
                id=user.id,
                name=user.name,
                profile_visible=can_view_profile(viewer, user),
            ),
            value=ranked_value,
            round_count=round_count,
            arrow_count=arrows,
        )
        for index, (user, ranked_value, round_count, arrows) in enumerate(s.execute(stmt))
    ]
