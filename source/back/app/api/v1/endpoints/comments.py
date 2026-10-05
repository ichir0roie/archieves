from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import comment as comment_crud
from app.crud import game as game_crud
from app.schemas.comment import (
    CommentWrite,
    EndCommentRead,
    GameCommentRead,
    GameComments,
    RoundCommentRead,
)

router = APIRouter()


@router.get("/games/{game_id}/comments", response_model=GameComments)
def list_comments_for_game(
    game_id: int, s: Session = Depends(deps.get_session)
) -> GameComments:
    """Every comment under one game - its own, its rounds' and its ends' -
    so a score sheet can be drawn in a single request."""
    deps.get_or_404(game_crud.get_game, s, game_id, detail="Game not found")
    return GameComments(
        game=comment_crud.get_game_comment(s, game_id),
        rounds=comment_crud.list_round_comments_for_game(s, game_id),
        ends=comment_crud.list_end_comments_for_game(s, game_id),
    )


@router.get("/games/{game_id}/comment", response_model=GameCommentRead)
def get_game_comment(game_id: int, s: Session = Depends(deps.get_session)) -> GameCommentRead:
    deps.get_or_404(game_crud.get_game, s, game_id, detail="Game not found")
    return deps.get_or_404(
        comment_crud.get_game_comment, s, game_id, detail="Comment not found"
    )


@router.put("/games/{game_id}/comment", response_model=GameCommentRead)
def save_game_comment(
    game_id: int, comment_in: CommentWrite, s: Session = Depends(deps.get_session)
) -> GameCommentRead:
    game = deps.get_or_404(game_crud.get_game, s, game_id, detail="Game not found")
    result = comment_crud.upsert_game_comment(s, game, comment_in.body)
    s.commit()
    return result


@router.delete("/games/{game_id}/comment", status_code=204)
def delete_game_comment(game_id: int, s: Session = Depends(deps.get_session)) -> None:
    comment = deps.get_or_404(
        comment_crud.get_game_comment, s, game_id, detail="Comment not found"
    )
    comment_crud.delete_comment(s, comment)
    s.commit()


@router.get("/rounds/{round_id}/comment", response_model=RoundCommentRead)
def get_round_comment(
    round_id: int, s: Session = Depends(deps.get_session)
) -> RoundCommentRead:
    deps.get_or_404(game_crud.get_round, s, round_id, detail="Round not found")
    return deps.get_or_404(
        comment_crud.get_round_comment, s, round_id, detail="Comment not found"
    )


@router.put("/rounds/{round_id}/comment", response_model=RoundCommentRead)
def save_round_comment(
    round_id: int, comment_in: CommentWrite, s: Session = Depends(deps.get_session)
) -> RoundCommentRead:
    round_ = deps.get_or_404(game_crud.get_round, s, round_id, detail="Round not found")
    result = comment_crud.upsert_round_comment(s, round_, comment_in.body)
    s.commit()
    return result


@router.delete("/rounds/{round_id}/comment", status_code=204)
def delete_round_comment(round_id: int, s: Session = Depends(deps.get_session)) -> None:
    comment = deps.get_or_404(
        comment_crud.get_round_comment, s, round_id, detail="Comment not found"
    )
    comment_crud.delete_comment(s, comment)
    s.commit()


@router.get("/ends/{end_id}/comment", response_model=EndCommentRead)
def get_end_comment(end_id: int, s: Session = Depends(deps.get_session)) -> EndCommentRead:
    deps.get_or_404(game_crud.get_end, s, end_id, detail="End not found")
    return deps.get_or_404(comment_crud.get_end_comment, s, end_id, detail="Comment not found")


@router.put("/ends/{end_id}/comment", response_model=EndCommentRead)
def save_end_comment(
    end_id: int, comment_in: CommentWrite, s: Session = Depends(deps.get_session)
) -> EndCommentRead:
    end = deps.get_or_404(game_crud.get_end, s, end_id, detail="End not found")
    result = comment_crud.upsert_end_comment(s, end, comment_in.body)
    s.commit()
    return result


@router.delete("/ends/{end_id}/comment", status_code=204)
def delete_end_comment(end_id: int, s: Session = Depends(deps.get_session)) -> None:
    comment = deps.get_or_404(
        comment_crud.get_end_comment, s, end_id, detail="Comment not found"
    )
    comment_crud.delete_comment(s, comment)
    s.commit()
