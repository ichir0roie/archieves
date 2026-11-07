import statistics
from datetime import UTC, date, datetime

from sqlalchemy import Exists, Row, Select, exists, func, or_, select, update
from sqlalchemy.orm import Session, aliased

from app.core.match_codes import new_match_id
from app.core.scoring import MAX_RING_SCORE, MISS_SCORE, X_SCORE, scored_value_column
from app.core.visibility import can_view_profile
from app.db import End, Game, Match, Point, Round, User
from app.db.models.match_model import MATCH_NUMBER_SEQ
from app.schemas.match import (
    MatchCreate,
    MatchDetail,
    MatchEntry,
    MatchRead,
    MatchStanding,
    MatchStatistics,
    MatchUpdate,
)
from app.schemas.statistics import RankedUser

# 偏差値の中心と幅
_DEVIATION_MEAN = 50
_DEVIATION_SCALE = 10


def create_match(s: Session, organizer_id: int, match_in: MatchCreate) -> Match:
    held_at = match_in.held_at or datetime.now(UTC)
    # 番号は連番なので、コードは重ならない(引き直しは要らない)
    number = s.scalar(select(MATCH_NUMBER_SEQ.next_value()))
    assert number is not None
    match = Match(
        id=new_match_id(held_at, organizer_id, number),
        organizer_id=organizer_id,
        held_at=held_at,
        title=match_in.title,
        description=match_in.description,
        game_size=match_in.game_size,
        round_size=match_in.round_size,
        end_size=match_in.end_size,
    )
    s.add(match)
    s.flush()
    return match


def update_match(s: Session, match: Match, match_in: MatchUpdate) -> Match:
    # 送られた欄だけを書き換える(省いた欄はそのまま)
    for field in match_in.model_fields_set:
        setattr(match, field, getattr(match_in, field))
    s.flush()
    return match


def delete_match(s: Session, match: Match) -> None:
    """試合を消す(消した印を付ける)。参加した人のゲームは消さず、試合から外してふつうのゲームに戻す。

    外さないと、消した試合を指したまま結果の画面へのリンクが残り、開くと「ありません」になる。
    """
    match.deleted_at = date.today()
    s.execute(update(Game).where(Game.match_id == match.id).values(match_id=None))
    s.flush()


def match_exists(s: Session, match_id: str) -> bool:
    """消したものも含めて、その id の試合が作られたことがあるか。"""
    return s.get(Match, match_id) is not None


def get_match(s: Session, match_id: str) -> Match | None:
    return s.scalar(select(Match).where(Match.id == match_id, Match.deleted_at.is_(None)))


def _has_arrows() -> Exists:
    """ゲームに、消していないラウンドの矢が一本でもあるか(結果に載るゲームか)。"""
    return exists().where(
        Round.game_id == Game.id,
        Round.deleted_at.is_(None),
        End.round_id == Round.id,
        Point.end_id == End.id,
    )


def _match_rows(viewer_id: int) -> Select:
    """試合と、作った人・試合のゲームの数・viewer のゲームの数を、試合一件につき一行で読む。

    試合ごとに数を引き直すと、一覧で試合の数だけ db を読むことになるので、相関する副問い合わせで
    一度に読む。ゲームの数は、点を足し合わせずに矢があるかだけを見る。
    """
    organizer = aliased(User)
    game_count = (
        select(func.count(Game.id))
        .where(Game.match_id == Match.id, Game.deleted_at.is_(None), _has_arrows())
        .correlate(Match)
        .scalar_subquery()
    )
    my_game_count = (
        select(func.count(Game.id))
        .where(Game.match_id == Match.id, Game.user_id == viewer_id, Game.deleted_at.is_(None))
        .correlate(Match)
        .scalar_subquery()
    )
    return (
        select(Match, organizer, game_count, my_game_count)
        .outerjoin(organizer, organizer.id == Match.organizer_id)
        .where(Match.deleted_at.is_(None))
    )


def _to_read(viewer: User, row: Row) -> MatchRead:
    match, organizer, game_count, my_game_count = row
    return MatchRead(
        id=match.id,
        held_at=match.held_at,
        title=match.title,
        description=match.description,
        game_size=match.game_size,
        round_size=match.round_size,
        end_size=match.end_size,
        organizer=_ranked_user(viewer, organizer) if organizer is not None else None,
        game_count=game_count,
        organized_by_me=match.organizer_id == viewer.id,
        my_game_count=my_game_count,
    )


def read_match(s: Session, viewer: User, match_id: str) -> MatchRead | None:
    row = s.execute(_match_rows(viewer.id).where(Match.id == match_id)).one_or_none()
    return _to_read(viewer, row) if row is not None else None


def _ranked_user(viewer: User, user: User) -> RankedUser:
    return RankedUser(
        id=user.id,
        name=user.name,
        profile_visible=can_view_profile(viewer, user),
    )


def list_my_matches(
    s: Session,
    me: User,
    *,
    skip: int = 0,
    limit: int = 100,
) -> list[MatchRead]:
    """me が作った試合と、me のゲーム(消したものは除く)がある試合。開いた日時の新しい順。"""
    joined = exists().where(
        Game.match_id == Match.id,
        Game.user_id == me.id,
        Game.deleted_at.is_(None),
    )
    rows = s.execute(
        _match_rows(me.id)
        .where(or_(Match.organizer_id == me.id, joined))
        .order_by(Match.held_at.desc(), Match.id.desc())
        .offset(skip)
        .limit(limit)
    )
    return [_to_read(me, row) for row in rows]


def get_match_detail(s: Session, viewer: User, match_id: str) -> MatchDetail | None:
    """試合の画面で読む一件。結果は、試合を開けた人(コードを知る人)ならだれにでも付ける。"""
    match = read_match(s, viewer, match_id)
    if match is None:
        return None
    return MatchDetail(
        **match.model_dump(),
        result=_standing(s, viewer, match_id),
    )


def _game_scores(match_id: str) -> Select:
    """試合のゲームごとの弓・距離・合計点・矢の数・X/10/M の本数。

    矢の無いゲームと、消したゲーム・ラウンドは外す。
    """
    return (
        select(
            Game.id.label("game_id"),
            Game.user_id,
            Game.bow_type,
            func.max(Round.distance_m).label("distance_m"),
            func.count(Point.id).label("arrow_count"),
            func.sum(scored_value_column(Point.score)).label("total_score"),
            func.count(Point.id).filter(Point.score >= X_SCORE).label("x_count"),
            func.count(Point.id).filter(Point.score == MAX_RING_SCORE).label("ten_count"),
            func.count(Point.id).filter(Point.score <= MISS_SCORE).label("miss_count"),
        )
        .join(Round, Round.game_id == Game.id)
        .join(End, End.round_id == Round.id)
        .join(Point, Point.end_id == End.id)
        .where(
            Game.match_id == match_id,
            Game.deleted_at.is_(None),
            Round.deleted_at.is_(None),
        )
        .group_by(Game.id)
    )


def _standing(s: Session, viewer: User, match_id: str) -> MatchStanding:
    """試合のゲームの順位・偏差値と、合計点の平均・標準偏差・中央値・最高・最低。

    順位・平均・標準偏差・偏差値は一度の問い合わせで db に出させ、中央値・最高・最低は
    その行の合計点から出す(集計のために点を足し直さない)。
    """
    games = _game_scores(match_id).subquery()

    average = func.avg(games.c.total_score).over()
    deviation = func.stddev_pop(games.c.total_score).over()
    rank = func.rank().over(
        order_by=[
            games.c.total_score.desc(),
            (games.c.ten_count + games.c.x_count).desc(),
            games.c.x_count.desc(),
        ]
    )
    # 標準偏差が 0(全員が同じ点・一人だけ)なら、偏差値は真ん中にする
    deviation_score = func.coalesce(
        _DEVIATION_MEAN
        + _DEVIATION_SCALE * (games.c.total_score - average) / func.nullif(deviation, 0),
        _DEVIATION_MEAN,
    )
    rows = s.execute(
        select(
            rank,
            games.c.game_id,
            User,
            games.c.bow_type,
            games.c.distance_m,
            games.c.total_score,
            games.c.arrow_count,
            games.c.x_count,
            games.c.ten_count,
            games.c.miss_count,
            deviation_score,
            average,
            deviation,
        )
        .join(User, User.id == games.c.user_id)
        .order_by(rank, games.c.game_id)
    ).all()
    entries = [
        MatchEntry(
            rank=entry_rank,
            game_id=game_id,
            user=_ranked_user(viewer, user),
            bow_type=bow_type,
            distance_m=distance_m,
            total_score=total,
            arrow_count=arrows,
            x_count=x_count,
            ten_count=ten_count,
            miss_count=miss_count,
            point_average=total / arrows,
            deviation_score=score,
        )
        for (
            entry_rank,
            game_id,
            user,
            bow_type,
            distance_m,
            total,
            arrows,
            x_count,
            ten_count,
            miss_count,
            score,
            _average,
            _deviation,
        ) in rows
    ]
    totals = [entry.total_score for entry in entries]
    return MatchStanding(
        statistics=MatchStatistics(
            count=len(entries),
            # 平均・標準偏差はどの行も同じ値(窓関数で全体を見たもの)
            average=rows[0][-2] if rows else None,
            standard_deviation=rows[0][-1] if rows else None,
            median=statistics.median(totals) if totals else None,
            max=max(totals, default=None),
            min=min(totals, default=None),
        ),
        entries=entries,
    )
