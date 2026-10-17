"""他人に見せる画面(スコアの公開ページ・プロフィール・ランキング)のエンドポイント。

ログインしていなくても読める。利用者の行とジョインし、持ち主の公開範囲が見る人に見せる分だけを返す。
利用者が発行したトークン(Claude Code など)では読ませない(deps.get_optional_me)。
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.api.pagination import Limit, Skip
from app.core.bow_types import BowType
from app.crud import game as game_crud
from app.crud import profile as profile_crud
from app.crud import statistics as statistics_crud
from app.crud import user as user_crud
from app.db import User
from app.schemas.game_sheet import SharedGameRead
from app.schemas.profile import UserProfile
from app.schemas.statistics import RankingMetric, UserRanking
from app.services import game_sheet as game_sheet_service

# 一度に読めるゲームの数。公開の URL はスコアの一か月分を載せる
MAX_SHARED_GAMES = 200

router = APIRouter()


@router.get("/scores", response_model=list[SharedGameRead])
def list_shared_scores(
    game_ids: Annotated[list[int], Query(min_length=1, max_length=MAX_SHARED_GAMES)],
    viewer: User | None = Depends(deps.get_optional_me),
    s: Session = Depends(deps.get_session),
) -> list[SharedGameRead]:
    """game_ids のゲームのうち、持ち主のスコアの公開範囲が見る人に見せるものの記録。日付の古い順。

    見せないゲームは、無い・消したゲームと区別せずに外す(id から、有るかどうかを探らせない)。
    """
    games = game_crud.list_shared_game_sheets(s, viewer, game_ids)
    return [game_sheet_service.read_shared_game(game) for game in games]


@router.get("/users/{user_id}/profile", response_model=UserProfile)
def get_user_profile(
    user_id: int,
    viewer: User | None = Depends(deps.get_optional_me),
    s: Session = Depends(deps.get_session),
) -> UserProfile:
    """プロフィールの公開範囲が見る人に見せる利用者の、基本情報と直近の集計。

    見せないなら 403(画面が「非公開」と出す)。
    スコア・日記は、それぞれの公開範囲が見せないとき null。
    """
    user = deps.get_or_404(
        user_crud.get_user_with_organization, s, user_id, detail="User not found"
    )
    deps.require_profile_visible(viewer, user)
    return profile_crud.get_user_profile(s, viewer, user)


@router.get("/ranking", response_model=list[UserRanking])
def list_user_ranking(
    metric: RankingMetric = RankingMetric.TOTAL_SCORE,
    organization_id: int | None = None,
    region_id: int | None = None,
    bow_type: BowType | None = None,
    distance_m: int | None = None,
    start: date | None = None,
    end: date | None = None,
    skip: Skip = 0,
    limit: Limit = 100,
    viewer: User | None = Depends(deps.get_optional_me),
    s: Session = Depends(deps.get_session),
) -> list[UserRanking]:
    """Users ranked by total score, average round score or average point
    score, high to low, optionally filtered by bow type, distance,
    organization, region, and/or period. ランキングを見る人に公開している人だけを載せる。"""
    return statistics_crud.list_user_ranking(
        s,
        viewer=viewer,
        metric=metric,
        organization_id=organization_id,
        region_id=region_id,
        bow_type=bow_type,
        distance_m=distance_m,
        start=start,
        end=end,
        skip=skip,
        limit=limit,
    )
