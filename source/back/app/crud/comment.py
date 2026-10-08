from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import End, EndComment, Game, GameComment, Round, RoundComment


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


def _save(s: Session, comment: GameComment | RoundComment | EndComment, body: str):
    """Writes the note, whether the row is a brand-new comment or the one
    already attached to the entity."""
    comment.body = body
    s.add(comment)
    s.flush()
    return comment


def upsert_game_comment(s: Session, game: Game, body: str) -> GameComment:
    comment = get_game_comment(s, game.id) or GameComment(
        game_id=game.id, user_id=game.user_id
    )
    return _save(s, comment, body)


def upsert_round_comment(s: Session, round_: Round, body: str) -> RoundComment:
    comment = get_round_comment(s, round_.id) or RoundComment(
        round_id=round_.id, user_id=round_.user_id
    )
    return _save(s, comment, body)


def upsert_end_comment(s: Session, end: End, body: str) -> EndComment:
    comment = get_end_comment(s, end.id) or EndComment(end_id=end.id, user_id=end.user_id)
    return _save(s, comment, body)


def delete_comment(s: Session, comment: GameComment | RoundComment | EndComment) -> None:
    s.delete(comment)
    s.flush()
