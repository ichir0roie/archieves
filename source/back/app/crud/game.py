from datetime import date

from sqlalchemy.orm import Query, Session

from app.core.target_types import resolve_target_size_cm
from app.db import End, Game, Match, Point, Round
from app.schemas.game import (
    EndCreate,
    EndUpdate,
    GameCreate,
    GameUpdate,
    MatchCreate,
    MatchSummary,
    MatchUpdate,
    PointCreate,
    PointUpdate,
    RoundCreate,
    RoundUpdate,
)


def _visible_games(s: Session) -> Query:
    return s.query(Game).filter(Game.deleted_at.is_(None))


def _visible_rounds(s: Session) -> Query:
    return (
        s.query(Round)
        .join(Game, Game.id == Round.game_id)
        .filter(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
    )


def _visible_ends(s: Session) -> Query:
    return (
        s.query(End)
        .join(Round, Round.id == End.round_id)
        .join(Game, Game.id == Round.game_id)
        .filter(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
    )


def _visible_points(s: Session) -> Query:
    return (
        s.query(Point)
        .join(End, End.id == Point.end_id)
        .join(Round, Round.id == End.round_id)
        .join(Game, Game.id == Round.game_id)
        .filter(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
    )


def get_game(s: Session, game_id: int) -> Game | None:
    return _visible_games(s).filter(Game.id == game_id).first()


def get_game_any(s: Session, game_id: int) -> Game | None:
    """Fetch a game regardless of its soft-delete state, for restore."""
    return s.get(Game, game_id)


def list_games(
    s: Session, skip: int = 0, limit: int = 100, user_id: int | None = None
) -> list[Game]:
    query = _visible_games(s)
    if user_id is not None:
        query = query.filter(Game.user_id == user_id)
    return list(query.order_by(Game.id).offset(skip).limit(limit).all())


def list_deleted_games(
    s: Session, skip: int = 0, limit: int = 100, user_id: int | None = None
) -> list[Game]:
    query = s.query(Game).filter(Game.deleted_at.isnot(None))
    if user_id is not None:
        query = query.filter(Game.user_id == user_id)
    return list(query.order_by(Game.deleted_at.desc()).offset(skip).limit(limit).all())


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
    return _visible_rounds(s).filter(Round.id == round_id).first()


def get_round_any(s: Session, round_id: int) -> Round | None:
    """Fetch a round regardless of its (or its game's) soft-delete state, for restore."""
    return s.get(Round, round_id)


def list_rounds_for_game(
    s: Session, game_id: int, skip: int = 0, limit: int = 100
) -> list[Round]:
    return list(
        _visible_rounds(s)
        .filter(Round.game_id == game_id)
        .order_by(Round.id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def list_deleted_rounds(
    s: Session,
    skip: int = 0,
    limit: int = 100,
    game_id: int | None = None,
    user_id: int | None = None,
) -> list[Round]:
    query = (
        s.query(Round)
        .join(Game, Game.id == Round.game_id)
        .filter(Round.deleted_at.isnot(None), Game.deleted_at.is_(None))
    )
    if game_id is not None:
        query = query.filter(Round.game_id == game_id)
    if user_id is not None:
        query = query.filter(Game.user_id == user_id)
    return list(query.order_by(Round.deleted_at.desc()).offset(skip).limit(limit).all())


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
    return _visible_ends(s).filter(End.id == end_id).first()


def list_ends_for_round(s: Session, round_id: int, skip: int = 0, limit: int = 100) -> list[End]:
    return list(
        _visible_ends(s)
        .filter(End.round_id == round_id)
        .order_by(End.id)
        .offset(skip)
        .limit(limit)
        .all()
    )


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


def _visible_matches(s: Session) -> Query:
    return s.query(Match).join(Game, Game.id == Match.game_id).filter(Game.deleted_at.is_(None))


def get_match(s: Session, match_id: int) -> Match | None:
    return _visible_matches(s).filter(Match.id == match_id).first()


def get_match_by_game(s: Session, game_id: int) -> Match | None:
    return _visible_matches(s).filter(Match.game_id == game_id).first()


def create_match(s: Session, game: Game, match_in: MatchCreate) -> Match:
    match = Match(game_id=game.id, user_id=game.user_id, **match_in.model_dump())
    s.add(match)
    s.flush()
    return match


def update_match(s: Session, match: Match, match_in: MatchUpdate) -> Match:
    for field, value in match_in.model_dump(exclude_unset=True).items():
        setattr(match, field, value)
    s.flush()
    return match


def delete_match(s: Session, match: Match) -> None:
    s.delete(match)
    s.flush()


def list_matches(
    s: Session,
    *,
    user_id: int | None = None,
    start: date | None = None,
    end: date | None = None,
    skip: int = 0,
    limit: int = 100,
) -> list[MatchSummary]:
    """Matches joined with their game's date, most recent first."""
    query = s.query(Match, Game.recorded_at).join(Game, Game.id == Match.game_id).filter(
        Game.deleted_at.is_(None)
    )
    if user_id is not None:
        query = query.filter(Game.user_id == user_id)
    if start is not None:
        query = query.filter(Game.recorded_at >= start)
    if end is not None:
        query = query.filter(Game.recorded_at <= end)
    query = query.order_by(Game.recorded_at.desc(), Match.id.desc()).offset(skip).limit(limit)

    return [
        MatchSummary(
            id=match.id,
            game_id=match.game_id,
            user_id=match.user_id,
            name=match.name,
            link=match.link,
            recorded_at=recorded_at,
        )
        for match, recorded_at in query.all()
    ]


def _point_cm(round_: Round | None, x: float, y: float) -> tuple[float | None, float | None]:
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
    return _visible_points(s).filter(Point.id == point_id).first()


def list_points_for_end(s: Session, end_id: int, skip: int = 0, limit: int = 100) -> list[Point]:
    return list(
        _visible_points(s)
        .filter(Point.end_id == end_id)
        .order_by(Point.id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_point(s: Session, end: End, point_in: PointCreate) -> Point:
    round_ = s.get(Round, end.round_id)
    x_cm, y_cm = _point_cm(round_, point_in.x, point_in.y)
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
        point.x_cm, point.y_cm = _point_cm(round_, point.x, point.y)
    s.flush()
    return point


def delete_point(s: Session, point: Point) -> None:
    s.delete(point)
    s.flush()
