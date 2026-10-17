from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import comment as comment_crud
from app.crud import game as game_crud
from app.db import AccessToken, User
from app.schemas.comment import (
    AiCommentRead,
    AiCommentWrite,
    CommentWrite,
    EndCommentRead,
    GameCommentRead,
    GameComments,
    RoundCommentRead,
)

router = APIRouter()


@router.get("/games/{game_id}/comments", response_model=GameComments)
def list_comments_for_game(
    game_id: int,
    me: User = Depends(deps.get_reader),
    s: Session = Depends(deps.get_session),
) -> GameComments:
    """Every comment under one game - its own, its rounds' and its ends' -
    so a score sheet can be drawn in a single request."""
    deps.get_own_or_404(me, game_crud.get_game, s, game_id, detail="Game not found")
    return GameComments(
        game=comment_crud.get_game_comment(s, game_id),
        rounds=comment_crud.list_round_comments_for_game(s, game_id),
        ends=comment_crud.list_end_comments_for_game(s, game_id),
    )


@router.get("/games/{game_id}/comment", response_model=GameCommentRead)
def get_game_comment(
    game_id: int,
    me: User = Depends(deps.get_reader),
    s: Session = Depends(deps.get_session),
) -> GameCommentRead:
    deps.get_own_or_404(me, game_crud.get_game, s, game_id, detail="Game not found")
    return deps.get_own_or_404(
        me, comment_crud.get_game_comment, s, game_id, detail="Comment not found"
    )


@router.put("/games/{game_id}/comment", response_model=GameCommentRead)
def save_game_comment(
    game_id: int,
    comment_in: CommentWrite,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> GameCommentRead:
    game = deps.get_own_or_404(me, game_crud.get_game, s, game_id, detail="Game not found")
    result = comment_crud.save_comment(
        s,
        game,
        comment_crud.get_game_comment(s, game_id),
        comment_in.body,
    )
    s.commit()
    return result


@router.delete("/games/{game_id}/comment", status_code=204)
def delete_game_comment(
    game_id: int,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> None:
    comment = deps.get_own_or_404(
        me, comment_crud.get_game_comment, s, game_id, detail="Comment not found"
    )
    comment_crud.delete_comment(s, comment)
    s.commit()


@router.get("/rounds/{round_id}/comment", response_model=RoundCommentRead)
def get_round_comment(
    round_id: int,
    me: User = Depends(deps.get_reader),
    s: Session = Depends(deps.get_session),
) -> RoundCommentRead:
    deps.get_own_or_404(me, game_crud.get_round, s, round_id, detail="Round not found")
    return deps.get_own_or_404(
        me, comment_crud.get_round_comment, s, round_id, detail="Comment not found"
    )


@router.put("/rounds/{round_id}/comment", response_model=RoundCommentRead)
def save_round_comment(
    round_id: int,
    comment_in: CommentWrite,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> RoundCommentRead:
    round_ = deps.get_own_or_404(me, game_crud.get_round, s, round_id, detail="Round not found")
    result = comment_crud.save_comment(
        s,
        round_,
        comment_crud.get_round_comment(s, round_id),
        comment_in.body,
    )
    s.commit()
    return result


@router.delete("/rounds/{round_id}/comment", status_code=204)
def delete_round_comment(
    round_id: int,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> None:
    comment = deps.get_own_or_404(
        me, comment_crud.get_round_comment, s, round_id, detail="Comment not found"
    )
    comment_crud.delete_comment(s, comment)
    s.commit()


@router.get("/ends/{end_id}/comment", response_model=EndCommentRead)
def get_end_comment(
    end_id: int,
    me: User = Depends(deps.get_reader),
    s: Session = Depends(deps.get_session),
) -> EndCommentRead:
    deps.get_own_or_404(me, game_crud.get_end, s, end_id, detail="End not found")
    return deps.get_own_or_404(
        me, comment_crud.get_end_comment, s, end_id, detail="Comment not found"
    )


@router.put("/ends/{end_id}/comment", response_model=EndCommentRead)
def save_end_comment(
    end_id: int,
    comment_in: CommentWrite,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> EndCommentRead:
    end = deps.get_own_or_404(me, game_crud.get_end, s, end_id, detail="End not found")
    result = comment_crud.save_comment(
        s,
        end,
        comment_crud.get_end_comment(s, end_id),
        comment_in.body,
    )
    s.commit()
    return result


@router.delete("/ends/{end_id}/comment", status_code=204)
def delete_end_comment(
    end_id: int,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> None:
    comment = deps.get_own_or_404(
        me, comment_crud.get_end_comment, s, end_id, detail="Comment not found"
    )
    comment_crud.delete_comment(s, comment)
    s.commit()


@router.put("/games/{game_id}/ai-comment", response_model=AiCommentRead)
def save_game_ai_comment(
    game_id: int,
    comment_in: AiCommentWrite,
    commenter: tuple[AccessToken, User] = Depends(deps.get_ai_commenter),
    s: Session = Depends(deps.get_session),
) -> AiCommentRead:
    """AI(Claude Code など)が、本人のトークンでゲームに指摘・改善点を書く。あれば上書きする。"""
    access_token, me = commenter
    game = deps.get_own_or_404(me, game_crud.get_game, s, game_id, detail="Game not found")
    result = comment_crud.save_game_ai_comment(s, game, comment_in.body, access_token.name)
    s.commit()
    return result


@router.delete("/games/{game_id}/ai-comment", status_code=204)
def delete_game_ai_comment(
    game_id: int,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> None:
    """本人が画面から AI コメントを消す。"""
    comment = deps.get_own_or_404(
        me, comment_crud.get_game_ai_comment, s, game_id, detail="AI comment not found"
    )
    comment_crud.delete_game_ai_comment(s, comment)
    s.commit()
