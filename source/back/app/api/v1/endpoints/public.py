"""ログインしていなくても読めるエンドポイント。見る人の公開範囲に入る分だけを返す。"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import game as game_crud
from app.db import User
from app.schemas.game_sheet import SharedGameRead
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
