from datetime import date

from sqlalchemy.orm import Query, Session

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


def _visible_games(db: Session) -> Query:
    return db.query(Game).filter(Game.deleted_at.is_(None))


def _visible_rounds(db: Session) -> Query:
    return (
        db.query(Round)
        .join(Game, Game.id == Round.game_id)
        .filter(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
    )


def _visible_ends(db: Session) -> Query:
    return (
        db.query(End)
        .join(Round, Round.id == End.round_id)
        .join(Game, Game.id == Round.game_id)
        .filter(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
    )


def _visible_points(db: Session) -> Query:
    return (
        db.query(Point)
        .join(End, End.id == Point.end_id)
        .join(Round, Round.id == End.round_id)
        .join(Game, Game.id == Round.game_id)
        .filter(Round.deleted_at.is_(None), Game.deleted_at.is_(None))
    )


def get_game(db: Session, game_id: int) -> Game | None:
    return _visible_games(db).filter(Game.id == game_id).first()


def get_game_any(db: Session, game_id: int) -> Game | None:
    """Fetch a game regardless of its soft-delete state, for restore."""
    return db.get(Game, game_id)


def list_games(
    db: Session, skip: int = 0, limit: int = 100, user_id: int | None = None
) -> list[Game]:
    query = _visible_games(db)
    if user_id is not None:
        query = query.filter(Game.user_id == user_id)
    return list(query.order_by(Game.id).offset(skip).limit(limit).all())


def list_deleted_games(
    db: Session, skip: int = 0, limit: int = 100, user_id: int | None = None
) -> list[Game]:
    query = db.query(Game).filter(Game.deleted_at.isnot(None))
    if user_id is not None:
        query = query.filter(Game.user_id == user_id)
    return list(query.order_by(Game.deleted_at.desc()).offset(skip).limit(limit).all())


def create_game(db: Session, game_in: GameCreate) -> Game:
    game = Game(**game_in.model_dump())
    db.add(game)
    db.commit()
    db.refresh(game)
    return game


def update_game(db: Session, game: Game, game_in: GameUpdate) -> Game:
    for field, value in game_in.model_dump(exclude_unset=True).items():
        setattr(game, field, value)
    db.commit()
    db.refresh(game)
    return game


def delete_game(db: Session, game: Game) -> None:
    game.deleted_at = date.today()
    db.commit()


def restore_game(db: Session, game: Game) -> Game:
    game.deleted_at = None
    db.commit()
    db.refresh(game)
    return game


def get_round(db: Session, round_id: int) -> Round | None:
    return _visible_rounds(db).filter(Round.id == round_id).first()


def get_round_any(db: Session, round_id: int) -> Round | None:
    """Fetch a round regardless of its (or its game's) soft-delete state, for restore."""
    return db.get(Round, round_id)


def list_rounds_for_game(
    db: Session, game_id: int, skip: int = 0, limit: int = 100
) -> list[Round]:
    return list(
        _visible_rounds(db)
        .filter(Round.game_id == game_id)
        .order_by(Round.id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def list_deleted_rounds(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    game_id: int | None = None,
    user_id: int | None = None,
) -> list[Round]:
    query = (
        db.query(Round)
        .join(Game, Game.id == Round.game_id)
        .filter(Round.deleted_at.isnot(None), Game.deleted_at.is_(None))
    )
    if game_id is not None:
        query = query.filter(Round.game_id == game_id)
    if user_id is not None:
        query = query.filter(Game.user_id == user_id)
    return list(query.order_by(Round.deleted_at.desc()).offset(skip).limit(limit).all())


def create_round(db: Session, game: Game, round_in: RoundCreate) -> Round:
    round_ = Round(game_id=game.id, user_id=game.user_id, **round_in.model_dump())
    db.add(round_)
    db.commit()
    db.refresh(round_)
    return round_


def update_round(db: Session, round_: Round, round_in: RoundUpdate) -> Round:
    for field, value in round_in.model_dump(exclude_unset=True).items():
        setattr(round_, field, value)
    db.commit()
    db.refresh(round_)
    return round_


def delete_round(db: Session, round_: Round) -> None:
    round_.deleted_at = date.today()
    db.commit()


def restore_round(db: Session, round_: Round) -> Round:
    round_.deleted_at = None
    db.commit()
    db.refresh(round_)
    return round_


def get_end(db: Session, end_id: int) -> End | None:
    return _visible_ends(db).filter(End.id == end_id).first()


def list_ends_for_round(db: Session, round_id: int, skip: int = 0, limit: int = 100) -> list[End]:
    return list(
        _visible_ends(db)
        .filter(End.round_id == round_id)
        .order_by(End.id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_end(db: Session, round_: Round, end_in: EndCreate) -> End:
    end = End(round_id=round_.id, user_id=round_.user_id, **end_in.model_dump())
    db.add(end)
    db.commit()
    db.refresh(end)
    return end


def update_end(db: Session, end: End, end_in: EndUpdate) -> End:
    for field, value in end_in.model_dump(exclude_unset=True).items():
        setattr(end, field, value)
    db.commit()
    db.refresh(end)
    return end


def delete_end(db: Session, end: End) -> None:
    db.delete(end)
    db.commit()


def _visible_matches(db: Session) -> Query:
    return db.query(Match).join(Game, Game.id == Match.game_id).filter(Game.deleted_at.is_(None))


def get_match(db: Session, match_id: int) -> Match | None:
    return _visible_matches(db).filter(Match.id == match_id).first()


def get_match_by_game(db: Session, game_id: int) -> Match | None:
    return _visible_matches(db).filter(Match.game_id == game_id).first()


def create_match(db: Session, game: Game, match_in: MatchCreate) -> Match:
    match = Match(game_id=game.id, user_id=game.user_id, **match_in.model_dump())
    db.add(match)
    db.commit()
    db.refresh(match)
    return match


def update_match(db: Session, match: Match, match_in: MatchUpdate) -> Match:
    for field, value in match_in.model_dump(exclude_unset=True).items():
        setattr(match, field, value)
    db.commit()
    db.refresh(match)
    return match


def delete_match(db: Session, match: Match) -> None:
    db.delete(match)
    db.commit()


def list_matches(
    db: Session,
    *,
    user_id: int | None = None,
    start: date | None = None,
    end: date | None = None,
    skip: int = 0,
    limit: int = 100,
) -> list[MatchSummary]:
    """Matches joined with their game's date, most recent first."""
    query = db.query(Match, Game.recorded_at).join(Game, Game.id == Match.game_id).filter(
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


def get_point(db: Session, point_id: int) -> Point | None:
    return _visible_points(db).filter(Point.id == point_id).first()


def list_points_for_end(db: Session, end_id: int, skip: int = 0, limit: int = 100) -> list[Point]:
    return list(
        _visible_points(db)
        .filter(Point.end_id == end_id)
        .order_by(Point.id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_point(db: Session, end: End, point_in: PointCreate) -> Point:
    point = Point(end_id=end.id, user_id=end.user_id, **point_in.model_dump())
    db.add(point)
    db.commit()
    db.refresh(point)
    return point


def update_point(db: Session, point: Point, point_in: PointUpdate) -> Point:
    for field, value in point_in.model_dump(exclude_unset=True).items():
        setattr(point, field, value)
    db.commit()
    db.refresh(point)
    return point


def delete_point(db: Session, point: Point) -> None:
    db.delete(point)
    db.commit()
