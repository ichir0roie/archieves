from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.api.pagination import Limit, Skip
from app.core.errors import ForbiddenError
from app.crud import match as match_crud
from app.db import User
from app.schemas.match import MatchCreate, MatchRead, MatchResult, MatchUpdate

# 試合。だれかが日時と矢の数を決めて作り、参加する人はその id(コード)でゲームを始める(ゲームの保存で
# match_id を送る。PUT /games/sheet)。読み書きとも画面からログインした人だけ(トークンは通さない)
router = APIRouter()


@router.post("/matches", response_model=MatchRead, status_code=201)
def create_match(
    match_in: MatchCreate,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> MatchRead:
    match = match_crud.create_match(s, me.id, match_in)
    result = match_crud.read_match(s, me, match)
    s.commit()
    return result


@router.get("/matches", response_model=list[MatchRead])
def list_my_matches(
    skip: Skip = 0,
    limit: Limit = 100,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> list[MatchRead]:
    """自分が作った試合と、自分のゲームがある試合。開いた日時の新しい順。"""
    return match_crud.list_my_matches(s, me, skip=skip, limit=limit)


@router.get("/matches/{match_id}", response_model=MatchRead)
def get_match(
    match_id: str,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> MatchRead:
    """試合の設定。参加する人が、このラウンド数・エンド数・矢数でゲームを始めるために読む。

    id(推測されにくいコード)を知っていればだれでも読める。
    """
    match = deps.get_or_404(match_crud.get_match, s, match_id, detail="Match not found")
    return match_crud.read_match(s, me, match)


@router.patch("/matches/{match_id}", response_model=MatchRead)
def update_match(
    match_id: str,
    match_in: MatchUpdate,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> MatchRead:
    """試合のタイトル・内容を直す。作った人だけ。"""
    match = deps.get_or_404(match_crud.get_match, s, match_id, detail="Match not found")
    if match.organizer_id != me.id:
        raise ForbiddenError("Only the organizer can edit the match")
    match_crud.update_match(s, match, match_in)
    result = match_crud.read_match(s, me, match)
    s.commit()
    return result


@router.delete("/matches/{match_id}", status_code=204)
def delete_match(
    match_id: str,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> None:
    """試合を消す。作った人だけ。参加した人のゲームは残り、試合から外れる。"""
    match = deps.get_or_404(match_crud.get_match, s, match_id, detail="Match not found")
    if match.organizer_id != me.id:
        raise ForbiddenError("Only the organizer can delete the match")
    match_crud.delete_match(s, match)
    s.commit()


@router.get("/matches/{match_id}/result", response_model=MatchResult)
def get_match_result(
    match_id: str,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> MatchResult:
    """試合の全員のスコアの順位・偏差値と、平均などの集計。

    作った人と、試合のゲームを持つ人だけが見られる。
    """
    match = deps.get_or_404(match_crud.get_match, s, match_id, detail="Match not found")
    if not match_crud.can_view_result(s, me, match):
        raise ForbiddenError("Only the organizer and participants can view the result")
    return match_crud.get_match_result(s, me, match)
