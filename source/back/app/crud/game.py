from datetime import date

from sqlalchemy import Select, extract, func, select
from sqlalchemy.orm import Session

from app.core.scoring import scored_value_column
from app.core.target_types import resolve_target_size_cm
from app.db import End, Game, Point, Round
from app.schemas.game import (
    EndCreate,
    EndUpdate,
    GameCreate,
    GameScoreSummary,
    GameUpdate,
    PointCreate,
    PointUpdate,
    RoundCreate,
    RoundUpdate,
)


def _visible_games() -> Select[tuple[Game]]:
    return select(Game).where(Game.deleted_at.is_(None))


def _visible_rounds() -> Select[tuple[Round]]:
    return (
        select(Round)
        .join(Game, Game.id == Round.game_id)
        .where(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
    )


def _visible_ends() -> Select[tuple[End]]:
    return (
        select(End)
        .join(Round, Round.id == End.round_id)
        .join(Game, Game.id == Round.game_id)
        .where(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
    )


def _visible_points() -> Select[tuple[Point]]:
    return (
        select(Point)
        .join(End, End.id == Point.end_id)
        .join(Round, Round.id == End.round_id)
        .join(Game, Game.id == Round.game_id)
        .where(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
    )


def get_game(s: Session, game_id: int) -> Game | None:
    return s.scalar(_visible_games().where(Game.id == game_id))


def get_game_any(s: Session, game_id: int) -> Game | None:
    """Fetch a game regardless of its soft-delete state, for restore."""
    return s.get(Game, game_id)


def get_game_by_client_key(s: Session, user_id: int, client_key: str) -> Game | None:
    """入力の画面が付けたキーのゲーム。消したゲームも返す(同じキーで作り直すと一意の制約に当たるため)。"""
    return s.scalar(select(Game).where(Game.user_id == user_id, Game.client_key == client_key))


def list_all_rounds_for_game(s: Session, game_id: int) -> list[Round]:
    """ゲームの見えるラウンドを全部(list_rounds_for_game と違い、件数で切らない)。"""
    return list(s.scalars(_visible_rounds().where(Round.game_id == game_id).order_by(Round.id)))


def list_all_ends_for_round(s: Session, round_id: int) -> list[End]:
    return list(s.scalars(_visible_ends().where(End.round_id == round_id).order_by(End.id)))


def list_all_points_for_end(s: Session, end_id: int) -> list[Point]:
    return list(s.scalars(_visible_points().where(Point.end_id == end_id).order_by(Point.id)))


def list_games(
    s: Session,
    skip: int = 0,
    limit: int = 100,
    user_id: int | None = None,
    year: int | None = None,
) -> list[Game]:
    stmt = _visible_games().order_by(Game.id).offset(skip).limit(limit)
    if user_id is not None:
        stmt = stmt.where(Game.user_id == user_id)
    if year is not None:
        stmt = stmt.where(
            Game.recorded_at >= date(year, 1, 1),
            Game.recorded_at < date(year + 1, 1, 1),
        )
    return list(s.scalars(stmt))


def list_game_scores(s: Session, user_id: int, year: int) -> list[GameScoreSummary]:
    """年内のゲームごとの合計点・エンド平均・ポイント(矢)平均。集計は db に任せる。"""
    # 矢のないエンド(outer join で残る)はエンド平均の分母に数えない
    end_totals = (
        select(
            Round.game_id.label("game_id"),
            End.id.label("end_id"),
            func.count(Point.id).label("arrow_count"),
            func.coalesce(func.sum(scored_value_column(Point.score)), 0).label("end_total"),
        )
        .join(End, End.round_id == Round.id)
        .outerjoin(Point, Point.end_id == End.id)
        .where(Round.deleted_at.is_(None))
        .group_by(Round.game_id, End.id)
        .subquery()
    )
    total = func.coalesce(func.sum(end_totals.c.end_total), 0)
    arrows = func.coalesce(func.sum(end_totals.c.arrow_count), 0)
    scored_ends = func.count(end_totals.c.end_id).filter(end_totals.c.arrow_count > 0)
    stmt = (
        select(
            Game.id,
            total,
            total / func.nullif(scored_ends, 0),
            total / func.nullif(arrows, 0),
        )
        .outerjoin(end_totals, end_totals.c.game_id == Game.id)
        .where(
            Game.deleted_at.is_(None),
            Game.user_id == user_id,
            Game.recorded_at >= date(year, 1, 1),
            Game.recorded_at < date(year + 1, 1, 1),
        )
        .group_by(Game.id)
        .order_by(Game.id)
    )
    return [
        GameScoreSummary(
            game_id=game_id,
            total_score=int(total_score),
            end_average=None if end_average is None else float(end_average),
            point_average=None if point_average is None else float(point_average),
        )
        for game_id, total_score, end_average, point_average in s.execute(stmt)
    ]


def list_game_years(s: Session, user_id: int) -> list[int]:
    """ゲームのある年。新しい年が先"""
    year = extract("year", Game.recorded_at)
    stmt = (
        select(year)
        .where(
            Game.deleted_at.is_(None),
            Game.user_id == user_id,
        )
        .group_by(year)
        .order_by(year.desc())
    )
    return [int(value) for value in s.scalars(stmt)]


def list_deleted_games(
    s: Session, skip: int = 0, limit: int = 100, user_id: int | None = None
) -> list[Game]:
    stmt = (
        select(Game)
        .where(Game.deleted_at.is_not(None))
        .order_by(Game.deleted_at.desc())
        .offset(skip)
        .limit(limit)
    )
    if user_id is not None:
        stmt = stmt.where(Game.user_id == user_id)
    return list(s.scalars(stmt))


def create_game(s: Session, game_in: GameCreate) -> Game:
    game = Game(**game_in.model_dump())
    s.add(game)
    s.flush()
    return game


def update_game(s: Session, game: Game, game_in: GameUpdate) -> Game:
    for field, value in game_in.model_dump(exclude_unset=True).items():
        setattr(game, field, value)
    s.flush()
    return game


def delete_game(s: Session, game: Game) -> None:
    game.deleted_at = date.today()
    s.flush()


def restore_game(s: Session, game: Game) -> Game:
    game.deleted_at = None
    s.flush()
    return game


def get_round(s: Session, round_id: int) -> Round | None:
    return s.scalar(_visible_rounds().where(Round.id == round_id))


def get_round_any(s: Session, round_id: int) -> Round | None:
    """Fetch a round regardless of its (or its game's) soft-delete state, for restore."""
    return s.get(Round, round_id)


def list_rounds_for_game(
    s: Session, game_id: int, skip: int = 0, limit: int = 100
) -> list[Round]:
    stmt = (
        _visible_rounds()
        .where(Round.game_id == game_id)
        .order_by(Round.id)
        .offset(skip)
        .limit(limit)
    )
    return list(s.scalars(stmt))


def list_deleted_rounds(
    s: Session,
    skip: int = 0,
    limit: int = 100,
    game_id: int | None = None,
    user_id: int | None = None,
) -> list[Round]:
    stmt = (
        select(Round)
        .join(Game, Game.id == Round.game_id)
        .where(Round.deleted_at.is_not(None), Game.deleted_at.is_(None))
        .order_by(Round.deleted_at.desc())
        .offset(skip)
        .limit(limit)
    )
    if game_id is not None:
        stmt = stmt.where(Round.game_id == game_id)
    if user_id is not None:
        stmt = stmt.where(Game.user_id == user_id)
    return list(s.scalars(stmt))


def create_round(s: Session, game: Game, round_in: RoundCreate) -> Round:
    round_ = Round(game_id=game.id, user_id=game.user_id, **round_in.model_dump())
    s.add(round_)
    s.flush()
    return round_


def update_round(s: Session, round_: Round, round_in: RoundUpdate) -> Round:
    for field, value in round_in.model_dump(exclude_unset=True).items():
        setattr(round_, field, value)
    s.flush()
    return round_


def delete_round(s: Session, round_: Round) -> None:
    round_.deleted_at = date.today()
    s.flush()


def restore_round(s: Session, round_: Round) -> Round:
    round_.deleted_at = None
    s.flush()
    return round_


def get_end(s: Session, end_id: int) -> End | None:
    return s.scalar(_visible_ends().where(End.id == end_id))


def list_ends_for_round(s: Session, round_id: int, skip: int = 0, limit: int = 100) -> list[End]:
    stmt = (
        _visible_ends().where(End.round_id == round_id).order_by(End.id).offset(skip).limit(limit)
    )
    return list(s.scalars(stmt))


def create_end(s: Session, round_: Round, end_in: EndCreate) -> End:
    end = End(round_id=round_.id, user_id=round_.user_id, **end_in.model_dump())
    s.add(end)
    s.flush()
    return end


def update_end(s: Session, end: End, end_in: EndUpdate) -> End:
    for field, value in end_in.model_dump(exclude_unset=True).items():
        setattr(end, field, value)
    s.flush()
    return end


def delete_end(s: Session, end: End) -> None:
    s.delete(end)
    s.flush()


def point_cm(round_: Round | None, x: float, y: float) -> tuple[float | None, float | None]:
    """x/y are the fraction (0-1, top-left origin) of the target face the
    arrow was tapped in, so (0.5, 0.5) is its center and the offset from
    there scales directly by the face's real size. (0, 0) is what the
    score-only input mode sends when no tap ever happened, so it carries no
    position at all."""
    if round_ is None or (x == 0 and y == 0):
        return None, None
    size_cm = resolve_target_size_cm(round_.target_type)
    if size_cm is None:
        return None, None
    return (x - 0.5) * size_cm, (y - 0.5) * size_cm


def get_point(s: Session, point_id: int) -> Point | None:
    return s.scalar(_visible_points().where(Point.id == point_id))


def list_points_for_end(s: Session, end_id: int, skip: int = 0, limit: int = 100) -> list[Point]:
    stmt = (
        _visible_points()
        .where(Point.end_id == end_id)
        .order_by(Point.id)
        .offset(skip)
        .limit(limit)
    )
    return list(s.scalars(stmt))


def create_point(s: Session, end: End, point_in: PointCreate) -> Point:
    round_ = s.get(Round, end.round_id)
    x_cm, y_cm = point_cm(round_, point_in.x, point_in.y)
    point = Point(end_id=end.id, user_id=end.user_id, x_cm=x_cm, y_cm=y_cm, **point_in.model_dump())
    s.add(point)
    s.flush()
    return point


def update_point(s: Session, point: Point, point_in: PointUpdate) -> Point:
    data = point_in.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(point, field, value)
    if "x" in data or "y" in data:
        end = s.get(End, point.end_id)
        round_ = s.get(Round, end.round_id) if end is not None else None
        point.x_cm, point.y_cm = point_cm(round_, point.x, point.y)
    s.flush()
    return point


def delete_point(s: Session, point: Point) -> None:
    s.delete(point)
    s.flush()
