from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import End, EndComment, Game, GameAiComment, GameComment, Round, RoundComment


def get_game_comment(s: Session, game_id: int) -> GameComment | None:
    return s.scalar(select(GameComment).where(GameComment.game_id == game_id))


def get_round_comment(s: Session, round_id: int) -> RoundComment | None:
    return s.scalar(select(RoundComment).where(RoundComment.round_id == round_id))


def get_end_comment(s: Session, end_id: int) -> EndComment | None:
    return s.scalar(select(EndComment).where(EndComment.end_id == end_id))


def list_round_comments_for_game(s: Session, game_id: int) -> list[RoundComment]:
    stmt = (
        select(RoundComment)
        .join(Round, Round.id == RoundComment.round_id)
        .where(Round.game_id == game_id, Round.deleted_at.is_(None))
        .order_by(RoundComment.id)
    )
    return list(s.scalars(stmt))


def list_end_comments_for_game(s: Session, game_id: int) -> list[EndComment]:
    stmt = (
        select(EndComment)
        .join(End, End.id == EndComment.end_id)
        .join(Round, Round.id == End.round_id)
        .where(Round.game_id == game_id, Round.deleted_at.is_(None))
        .order_by(EndComment.id)
    )
    return list(s.scalars(stmt))


type Comment = GameComment | RoundComment | EndComment


def _new_comment(owner: Game | Round | End) -> Comment:
    # 関係で結ぶので、まだ flush していない(id の無い)ラウンド・エンドにも付けられる
    match owner:
        case Game():
            return GameComment(game=owner, user_id=owner.user_id)
        case Round():
            return RoundComment(round=owner, user_id=owner.user_id)
        case End():
            return EndComment(end=owner, user_id=owner.user_id)


def save_comment(
    s: Session,
    owner: Game | Round | End,
    current: Comment | None,
    body: str | None,
) -> Comment | None:
    """owner のコメント(今あるのは current)を body にする。body が None なら消す。

    current は呼ぶ側が引いて渡す(owner.comment は noload なので、読み込んでいなければ使えない)。
    """
    if body is None:
        if current is not None:
            delete_comment(s, current)
        return None
    comment = current if current is not None else _new_comment(owner)
    comment.body = body
    s.add(comment)
    s.flush()
    return comment


def delete_comment(s: Session, comment: Comment) -> None:
    s.delete(comment)
    s.flush()


def get_game_ai_comment(s: Session, game_id: int) -> GameAiComment | None:
    return s.scalar(select(GameAiComment).where(GameAiComment.game_id == game_id))


def save_game_ai_comment(s: Session, game: Game, body: str, author: str) -> GameAiComment:
    """game の AI コメントを body にする(あれば上書き)。author は書いたトークンの名前。"""
    comment = get_game_ai_comment(s, game.id) or GameAiComment(
        game_id=game.id,
        user_id=game.user_id,
    )
    comment.body = body
    comment.author = author
    s.add(comment)
    s.flush()
    s.refresh(comment)
    return comment


def delete_game_ai_comment(s: Session, comment: GameAiComment) -> None:
    s.delete(comment)
    s.flush()
