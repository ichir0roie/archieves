from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import End, EndPhoto, Round


def get_photo(s: Session, photo_id: int) -> EndPhoto | None:
    return s.get(EndPhoto, photo_id)


def get_end_photo(s: Session, end_id: int) -> EndPhoto | None:
    return s.scalar(select(EndPhoto).where(EndPhoto.end_id == end_id))


def list_game_photos(s: Session, game_id: int) -> list[EndPhoto]:
    """ゲームのエンドの写真を、ラウンド・エンドの順に。ゴミ箱のラウンドの分は含めない"""
    return list(
        s.scalars(
            select(EndPhoto)
            .join(End, End.id == EndPhoto.end_id)
            .join(Round, Round.id == End.round_id)
            .where(Round.game_id == game_id, Round.deleted_at.is_(None))
            .order_by(Round.number, Round.id, End.number, End.id)
        )
    )


def list_photos_for_ends(s: Session, end_ids: list[int]) -> list[EndPhoto]:
    return list(s.scalars(select(EndPhoto).where(EndPhoto.end_id.in_(end_ids))))


def create_photo(
    s: Session,
    end: End,
    *,
    status: str,
    content_type: str,
    original_key: str,
) -> EndPhoto:
    photo = EndPhoto(
        end_id=end.id,
        user_id=end.user_id,
        status=status,
        content_type=content_type,
        original_key=original_key,
    )
    s.add(photo)
    s.flush()
    return photo


def delete_photo(s: Session, photo: EndPhoto) -> None:
    s.delete(photo)
    s.flush()
