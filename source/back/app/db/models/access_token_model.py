from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.access_token import DISPLAY_PREFIX_LENGTH, MAX_NAME_LENGTH
from app.db.base_class import Base, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.system_model import User


class AccessToken(TimestampMixin, Base):
    """利用者が発行した、本人の記録を読むだけのトークン(app/core/access_token.py)。

    失効させたら行ごと消す(deleted_at は使わない)。
    """

    __tablename__ = "access_tokens"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(MAX_NAME_LENGTH))
    # 平文の sha256(16 進)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    # 一覧でどのトークンかを見分けるための、平文の頭
    token_prefix: Mapped[str] = mapped_column(String(DISPLAY_PREFIX_LENGTH))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(lazy="noload")
