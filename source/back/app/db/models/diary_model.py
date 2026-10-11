from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.diary import MAX_DIARY_LENGTH
from app.db.base_class import Base, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.system_model import User


class Diary(TimestampMixin, Base):
    """日記。試合の記録とは結び付けない。書いた日時は created_at。"""

    __tablename__ = "diaries"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    body: Mapped[str] = mapped_column(String(MAX_DIARY_LENGTH))

    user: Mapped[User] = relationship(lazy="noload")
