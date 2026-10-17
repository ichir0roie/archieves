from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.access_token import MAX_NAME_LENGTH
from app.core.comments import MAX_AI_COMMENT_LENGTH, MAX_COMMENT_LENGTH
from app.db.base_class import Base, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.game_model import End, Game, Round


class CommentMixin(TimestampMixin):
    """Every comment table's shared shape: its author and the note itself.

    Each comment class below adds only what is its own - the foreign key to
    the entity it annotates (unique: one comment per entity) and the
    relationship back to it.
    """

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    body: Mapped[str] = mapped_column(String(MAX_COMMENT_LENGTH))


class GameComment(CommentMixin, Base):
    """The note attached to a whole game."""

    __tablename__ = "game_comments"

    game_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("games.id", ondelete="CASCADE"), unique=True, index=True
    )

    game: Mapped[Game] = relationship(back_populates="comment", lazy="noload")


class RoundComment(CommentMixin, Base):
    """The note attached to a single round."""

    __tablename__ = "round_comments"

    round_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rounds.id", ondelete="CASCADE"), unique=True, index=True
    )

    round: Mapped[Round] = relationship(back_populates="comment", lazy="noload")


class EndComment(CommentMixin, Base):
    """The note attached to a single end."""

    __tablename__ = "end_comments"

    end_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ends.id", ondelete="CASCADE"), unique=True, index=True
    )

    end: Mapped[End] = relationship(back_populates="comment", lazy="noload")


class GameAiComment(TimestampMixin, Base):
    """AI(Claude Code など)がゲームに付けた指摘・改善点。ゲームごとに一つ。

    本人のトークンでだけ書く(書き直すと上書き)。本人のコメント(GameComment)とは分けて持ち、
    スコアの公開ページには載せない。
    """

    __tablename__ = "game_ai_comments"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    game_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("games.id", ondelete="CASCADE"), unique=True, index=True
    )
    body: Mapped[str] = mapped_column(String(MAX_AI_COMMENT_LENGTH))
    # 書いたトークンの名前(access_tokens.name)。トークンを失効させても残す
    author: Mapped[str] = mapped_column(String(MAX_NAME_LENGTH))

    game: Mapped[Game] = relationship(back_populates="ai_comment", lazy="noload")
