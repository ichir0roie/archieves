from sqlalchemy.orm import Session

from app.db import End, EndComment, Game, GameComment, Round, RoundComment


def get_game_comment(db: Session, game_id: int) -> GameComment | None:
    return db.query(GameComment).filter(GameComment.game_id == game_id).first()


def get_round_comment(db: Session, round_id: int) -> RoundComment | None:
    return db.query(RoundComment).filter(RoundComment.round_id == round_id).first()


def get_end_comment(db: Session, end_id: int) -> EndComment | None:
    return db.query(EndComment).filter(EndComment.end_id == end_id).first()


def list_round_comments_for_game(db: Session, game_id: int) -> list[RoundComment]:
    return list(
        db.query(RoundComment)
        .join(Round, Round.id == RoundComment.round_id)
        .filter(Round.game_id == game_id, Round.deleted_at.is_(None))
        .order_by(RoundComment.id)
        .all()
    )


def list_end_comments_for_game(db: Session, game_id: int) -> list[EndComment]:
    return list(
        db.query(EndComment)
        .join(End, End.id == EndComment.end_id)
        .join(Round, Round.id == End.round_id)
        .filter(Round.game_id == game_id, Round.deleted_at.is_(None))
        .order_by(EndComment.id)
        .all()
    )


def _save(db: Session, comment: GameComment | RoundComment | EndComment, body: str):
    """Writes the note, whether the row is a brand-new comment or the one
    already attached to the entity."""
    comment.body = body
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def upsert_game_comment(db: Session, game: Game, body: str) -> GameComment:
    comment = get_game_comment(db, game.id) or GameComment(
        game_id=game.id, user_id=game.user_id
    )
    return _save(db, comment, body)


def upsert_round_comment(db: Session, round_: Round, body: str) -> RoundComment:
    comment = get_round_comment(db, round_.id) or RoundComment(
        round_id=round_.id, user_id=round_.user_id
    )
    return _save(db, comment, body)


def upsert_end_comment(db: Session, end: End, body: str) -> EndComment:
    comment = get_end_comment(db, end.id) or EndComment(end_id=end.id, user_id=end.user_id)
    return _save(db, comment, body)


def delete_comment(db: Session, comment: GameComment | RoundComment | EndComment) -> None:
    db.delete(comment)
    db.commit()
