import statistics
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.scoring import scored_value_column
from app.db import End, Game, Point, Round, User
from app.schemas.statistics import EndScoreSummary, RoundScoreSummary, ScoreStatistics, UserRanking


def _score_statistics(values: list[int]) -> ScoreStatistics:
    if not values:
        return ScoreStatistics(count=0, total=0)
    return ScoreStatistics(
        count=len(values),
        total=sum(values),
        min=min(values),
        max=max(values),
        average=statistics.mean(values),
        median=statistics.median(values),
    )


def list_round_scores(
    db: Session,
    *,
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
) -> list[RoundScoreSummary]:
    query = (
        db.query(
            Round.id,
            Round.game_id,
            Round.number,
            Round.recorded_at,
            func.count(Point.id),
            func.coalesce(func.sum(scored_value_column(Point.score)), 0),
        )
        .join(Game, Game.id == Round.game_id)
        .outerjoin(End, End.round_id == Round.id)
        .outerjoin(Point, Point.end_id == End.id)
        .filter(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
    )
    if start is not None:
        query = query.filter(Round.recorded_at >= start)
    if end is not None:
        query = query.filter(Round.recorded_at <= end)
    if user_id is not None:
        query = query.filter(Game.user_id == user_id)
    query = query.group_by(Round.id, Round.game_id, Round.number, Round.recorded_at).order_by(
        Round.recorded_at, Round.id
    )

    return [
        RoundScoreSummary(
            round_id=round_id,
            game_id=game_id,
            number=number,
            recorded_at=recorded_at,
            arrow_count=arrow_count,
            total_score=total_score,
            average_score=(total_score / arrow_count) if arrow_count else None,
        )
        for round_id, game_id, number, recorded_at, arrow_count, total_score in query.all()
    ]


def list_end_scores(
    db: Session,
    *,
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
) -> list[EndScoreSummary]:
    query = (
        db.query(
            End.id,
            End.round_id,
            End.number,
            End.recorded_at,
            func.count(Point.id),
            func.coalesce(func.sum(scored_value_column(Point.score)), 0),
        )
        .join(Round, Round.id == End.round_id)
        .join(Game, Game.id == Round.game_id)
        .outerjoin(Point, Point.end_id == End.id)
        .filter(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
    )
    if start is not None:
        query = query.filter(End.recorded_at >= start)
    if end is not None:
        query = query.filter(End.recorded_at <= end)
    if user_id is not None:
        query = query.filter(Game.user_id == user_id)
    query = query.group_by(End.id, End.round_id, End.number, End.recorded_at).order_by(
        End.recorded_at, End.id
    )

    return [
        EndScoreSummary(
            end_id=end_id,
            round_id=round_id,
            number=number,
            recorded_at=recorded_at,
            arrow_count=arrow_count,
            total_score=total_score,
            average_score=(total_score / arrow_count) if arrow_count else None,
        )
        for end_id, round_id, number, recorded_at, arrow_count, total_score in query.all()
    ]


def round_score_statistics(
    db: Session,
    *,
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
) -> ScoreStatistics:
    rounds = list_round_scores(db, start=start, end=end, user_id=user_id)
    return _score_statistics([r.total_score for r in rounds])


def end_score_statistics(
    db: Session,
    *,
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
) -> ScoreStatistics:
    ends = list_end_scores(db, start=start, end=end, user_id=user_id)
    return _score_statistics([e.total_score for e in ends])


def point_score_statistics(
    db: Session,
    *,
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
) -> ScoreStatistics:
    query = (
        db.query(scored_value_column(Point.score))
        .join(End, End.id == Point.end_id)
        .join(Round, Round.id == End.round_id)
        .join(Game, Game.id == Round.game_id)
        .filter(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
    )
    if start is not None:
        query = query.filter(Point.recorded_at >= start)
    if end is not None:
        query = query.filter(Point.recorded_at <= end)
    if user_id is not None:
        query = query.filter(Game.user_id == user_id)

    scores = [score for (score,) in query.all()]
    return _score_statistics(scores)


def list_user_ranking(
    db: Session,
    *,
    organization_id: int | None = None,
    region_id: int | None = None,
    start: date | None = None,
    end: date | None = None,
    skip: int = 0,
    limit: int = 100,
) -> list[UserRanking]:
    """Users ranked by their average game score, high to low, within a
    period and optionally scoped to an organization and/or region."""
    game_scores = (
        db.query(
            Game.user_id.label("user_id"),
            Game.id.label("game_id"),
            func.coalesce(func.sum(scored_value_column(Point.score)), 0).label("total_score"),
        )
        .outerjoin(Round, Round.game_id == Game.id)
        .outerjoin(End, End.round_id == Round.id)
        .outerjoin(Point, Point.end_id == End.id)
        .filter(Game.deleted_at.is_(None), Game.user_id.isnot(None), Round.deleted_at.is_(None))
    )
    if start is not None:
        game_scores = game_scores.filter(Game.recorded_at >= start)
    if end is not None:
        game_scores = game_scores.filter(Game.recorded_at <= end)
    game_scores = game_scores.group_by(Game.user_id, Game.id).subquery()

    query = (
        db.query(
            User,
            func.count(game_scores.c.game_id),
            func.avg(game_scores.c.total_score),
        )
        .join(game_scores, game_scores.c.user_id == User.id)
        .filter(User.deleted_at.is_(None))
    )
    if organization_id is not None:
        query = query.filter(User.organization_id == organization_id)
    if region_id is not None:
        query = query.filter(User.region_id == region_id)
    query = query.group_by(User.id).order_by(
        func.avg(game_scores.c.total_score).desc(), User.id
    )
    rows = query.offset(skip).limit(limit).all()

    return [
        UserRanking(
            rank=skip + index + 1,
            user=user,
            game_count=game_count,
            average_score=average_score,
        )
        for index, (user, game_count, average_score) in enumerate(rows)
    ]
