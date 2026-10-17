from datetime import date

from sqlalchemy import Select, extract, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, contains_eager, joinedload

from app.core.scoring import scored_value_column
from app.core.target_types import resolve_target_size_cm
from app.core.visibility import Visibility
from app.crud import user as user_crud
from app.db import End, Game, Point, Round, User
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


def _with_sheet(stmt: Select[tuple[Game]]) -> Select[tuple[Game]]:
    """ゲームに、記録(ラウンド・エンド・矢・コメント)を同じ SELECT で付けて引く。

    子の関係は noload なので、ここでだけ joinedload で読む。ゴミ箱のラウンドとその配下は含めない
    (_visible_* と同じ)。読み込み済みのゲームも、db の今の中身で読み直す(populate_existing)。
    """
    return stmt.options(
        joinedload(Game.comment),
        joinedload(Game.ai_comment),
        joinedload(Game.rounds.and_(Round.deleted_at.is_(None))).options(
            joinedload(Round.comment),
            joinedload(Round.ends).options(
                joinedload(End.comment),
                joinedload(End.points),
            ),
        ),
    ).execution_options(populate_existing=True)


def get_game_sheet(s: Session, game_id: int) -> Game | None:
    """見えるゲームを、記録を丸ごと読み込んだ形で。"""
    return s.scalars(_with_sheet(_visible_games().where(Game.id == game_id))).unique().one_or_none()


def list_game_sheets(
    s: Session,
    user_id: int,
    *,
    recorded_on: date | None = None,
    until: date | None = None,
    limit: int,
) -> list[Game]:
    """利用者の見えるゲームを、記録を丸ごと読み込んだ形で新しい順に limit 件。

    recorded_on はその日のゲームだけ、until はその日まで(その日を含む)のゲームに絞る。
    """
    game_ids = (
        select(Game.id)
        .where(Game.user_id == user_id, Game.deleted_at.is_(None))
        .order_by(Game.recorded_at.desc(), Game.id.desc())
        .limit(limit)
    )
    if recorded_on is not None:
        game_ids = game_ids.where(Game.recorded_at == recorded_on)
    if until is not None:
        game_ids = game_ids.where(Game.recorded_at <= until)
    # 子を joinedload で付けると行が矢の数だけ増えるので、件数はゲームの id の方で絞る
    stmt = _with_sheet(select(Game).where(Game.id.in_(game_ids))).order_by(
        Game.recorded_at.desc(), Game.id.desc()
    )
    return list(s.scalars(stmt).unique())


def list_shared_game_sheets(s: Session, viewer: User | None, game_ids: list[int]) -> list[Game]:
    """game_ids のうち、持ち主の score_visibility が viewer に見せるゲーム。

    記録と持ち主(Game.user)を読み込んだ形で返す。

    viewer が None(ログインしていない)なら全体公開の分だけ。本人のゲームは公開範囲に依らず返す。
    無いゲーム・消したゲームは外す。日付の古い順。
    """
    if viewer is None:
        visible = User.score_visibility == Visibility.PUBLIC
    else:
        visible = or_(
            User.id == viewer.id,
            user_crud.visible_condition(viewer, User.score_visibility),
        )
    stmt = (
        _with_sheet(_visible_games())
        .join(User, User.id == Game.user_id)
        .options(contains_eager(Game.user))
        .where(Game.id.in_(game_ids), visible)
        .order_by(Game.recorded_at, Game.id)
    )
    return list(s.scalars(stmt).unique())


def _by_client_key(user_id: int, client_key: str) -> Select[tuple[Game]]:
    # 消したゲームも含める(同じキーで作り直すと一意の制約に当たるため)
    return _with_sheet(
        select(Game).where(
            Game.user_id == user_id,
            Game.client_key == client_key,
        )
    )


def get_game_sheet_by_client_key(s: Session, user_id: int, client_key: str) -> Game | None:
    """入力の画面が付けたキーのゲームを、記録を丸ごと読み込んだ形で。消したゲームも返す。"""
    return s.scalars(_by_client_key(user_id, client_key)).unique().one_or_none()


def refresh_game_sheet(s: Session, game: Game) -> Game:
    """書いたあとのゲームの記録を、db の今の中身で読み直す。"""
    return s.scalars(_with_sheet(select(Game).where(Game.id == game.id))).unique().one()


def create_sheet_game(
    s: Session,
    user_id: int,
    recorded_at: date,
    client_key: str | None = None,
) -> Game:
    """記録の一括保存で作る、まだ記録の無いゲーム。"""
    game = Game(
        user_id=user_id,
        recorded_at=recorded_at,
        client_key=client_key,
    )
    s.add(game)
    s.flush()
    return game


def get_or_create_game_by_client_key(
    s: Session,
    user_id: int,
    client_key: str,
    recorded_at: date,
) -> Game:
    """client_key のゲーム(消したものも)。無ければ作る。

    同じ client_key の初回の保存が並んで届くと、後の方は一意の制約に当たる。そのときは先に入った
    ゲームを返す(get_or_create_user と同じ形)。
    """
    game = get_game_sheet_by_client_key(s, user_id, client_key)
    if game is not None:
        return game
    try:
        # 入れ損ねたときに、この行の分だけを巻き戻す(呼び出し側の行は残す)
        with s.begin_nested():
            return create_sheet_game(s, user_id, recorded_at, client_key)
    except IntegrityError:
        return s.scalars(_by_client_key(user_id, client_key)).unique().one()


def list_games(
    s: Session,
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    year: int | None = None,
) -> list[Game]:
    stmt = (
        _visible_games()
        .where(Game.user_id == user_id)
        .order_by(Game.id)
        .offset(skip)
        .limit(limit)
    )
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
    s: Session,
    user_id: int,
    skip: int = 0,
    limit: int = 100,
) -> list[Game]:
    stmt = (
        select(Game)
        .where(Game.user_id == user_id, Game.deleted_at.is_not(None))
        .order_by(Game.deleted_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(s.scalars(stmt))


def create_game(s: Session, user_id: int, game_in: GameCreate) -> Game:
    game = Game(user_id=user_id, **game_in.model_dump())
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
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    game_id: int | None = None,
) -> list[Round]:
    stmt = (
        select(Round)
        .join(Game, Game.id == Round.game_id)
        .where(
            Game.user_id == user_id,
            Round.deleted_at.is_not(None),
            Game.deleted_at.is_(None),
        )
        .order_by(Round.deleted_at.desc())
        .offset(skip)
        .limit(limit)
    )
    if game_id is not None:
        stmt = stmt.where(Round.game_id == game_id)
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
    """x/y are the fraction (top-left origin; 0-1 spans the target face,
    misses outside it go beyond) of the target face, so (0.5, 0.5) is its center and the offset from
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
