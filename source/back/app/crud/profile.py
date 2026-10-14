from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.visibility import is_visible
from app.crud import diary as diary_crud
from app.crud import statistics as statistics_crud
from app.db import Game, User
from app.schemas.diary import DiaryRead
from app.schemas.profile import UserProfile
from app.schemas.user import UserRead

# 集計に入れる直近のゲームの数
SUMMARY_GAME_COUNT = 100
# スコアの公開ページにまとめて載せる直近のゲームの数
RECENT_GAME_COUNT = 10
RECENT_DIARY_COUNT = 10


def _recent_game_ids(user_id: int, limit: int) -> Select[tuple[int]]:
    """利用者の新しいゲームから limit 件の id を返す select。消したゲームは外す。"""
    return (
        select(Game.id)
        .where(Game.user_id == user_id, Game.deleted_at.is_(None))
        .order_by(Game.recorded_at.desc(), Game.id.desc())
        .limit(limit)
    )


def get_user_profile(s: Session, viewer: User, user: User) -> UserProfile:
    """プロフィールを見せてよいかは呼ぶ側が確かめる。スコア・日記はここで公開範囲を当てる。

    本人には、公開範囲に依らずスコア・日記を見せる。
    """
    user_id = user.id
    game_ids = _recent_game_ids(user_id, SUMMARY_GAME_COUNT)
    game_count, period_start, period_end = s.execute(
        select(
            func.count(Game.id),
            func.min(Game.recorded_at),
            func.max(Game.recorded_at),
        ).where(Game.id.in_(game_ids))
    ).one()

    is_me = viewer.id == user.id
    recent_game_ids = (
        list(s.scalars(_recent_game_ids(user_id, RECENT_GAME_COUNT)))
        if is_me or is_visible(viewer, user, user.score_visibility)
        else None
    )
    recent_diaries = (
        [
            DiaryRead.model_validate(diary)
            for diary in diary_crud.list_diaries(s, user_id, limit=RECENT_DIARY_COUNT)
        ]
        if is_me or is_visible(viewer, user, user.diary_visibility)
        else None
    )

    return UserProfile(
        user=UserRead.model_validate(user),
        game_count=game_count,
        period_start=period_start,
        period_end=period_end,
        rounds=statistics_crud.round_score_statistics(s, user_id=user_id, game_ids=game_ids),
        ends=statistics_crud.end_score_statistics(s, user_id=user_id, game_ids=game_ids),
        points=statistics_crud.point_score_statistics(s, user_id=user_id, game_ids=game_ids),
        recent_game_ids=recent_game_ids,
        recent_diaries=recent_diaries,
    )
