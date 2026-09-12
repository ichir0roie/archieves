from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.comments import MAX_COMMENT_LENGTH
from app.db.base_class import Base, BigIntegerPK, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.game_model import End, Game, Round


class CommentMixin(TimestampMixin):
    """Every comment table's shared shape: its author and the note itself.

    Each comment class below adds only what is its own - the foreign key to
    the entity it annotates (unique: one comment per entity) and the
    relationship back to it.
    """

    user_id: Mapped[int] = mapped_column(
        BigIntegerPK, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    body: Mapped[str] = mapped_column(String(MAX_COMMENT_LENGTH))


class GameComment(CommentMixin, Base):
    """The note attached to a whole game."""

    __tablename__ = "game_comments"

    game_id: Mapped[int] = mapped_column(
        BigIntegerPK, ForeignKey("games.id", ondelete="CASCADE"), unique=True, index=True
    )

    game: Mapped[Game] = relationship(back_populates="comment", lazy="noload")


class RoundComment(CommentMixin, Base):
    """The note attached to a single round."""

    __tablename__ = "round_comments"

    round_id: Mapped[int] = mapped_column(
        BigIntegerPK, ForeignKey("rounds.id", ondelete="CASCADE"), unique=True, index=True
    )

    round: Mapped[Round] = relationship(back_populates="comment", lazy="noload")


class EndComment(CommentMixin, Base):
    """The note attached to a single end."""

    __tablename__ = "end_comments"

    end_id: Mapped[int] = mapped_column(
        BigIntegerPK, ForeignKey("ends.id", ondelete="CASCADE"), unique=True, index=True
    )

    end: Mapped[End] = relationship(back_populates="comment", lazy="noload")
