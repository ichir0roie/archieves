from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.comment_model import EndComment, GameComment, RoundComment
    from app.db.models.system_model import User


class Game(TimestampMixin, Base):
    """An archery session/competition, made up of one or more rounds."""

    __tablename__ = "games"
    __table_args__ = (
        UniqueConstraint("user_id", "client_key", name="uq_games_user_id_client_key"),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    recorded_at: Mapped[date] = mapped_column(Date)

    # How many rounds the player set up for this game before recording started.
    game_size: Mapped[int | None] = mapped_column(Integer, default=None)
    # BowType の値、またはプリセット以外の自由入力の名前。
    # 弓の種類を持たなかった頃の記録と旧アプリからの取り込みは null。
    bow_type: Mapped[str | None] = mapped_column(String(20), default=None)
    # 入力の画面が新しいゲームに付けるキー。一括の保存(PUT /games/sheet)の応答を失って送り直しても、
    # 同じゲームを上書きして二つ作らないために使う。画面を通らずに作ったゲームは null
    client_key: Mapped[str | None] = mapped_column(String(64), default=None)
    # 記入画面で、矢として扱う円の直径(画面の px)。点数の決め方に使う。設定する前の記録は null
    # (画面は既定の大きさで扱う)
    arrow_diameter_px: Mapped[int | None] = mapped_column(Integer, default=None)

    user: Mapped[User] = relationship(back_populates="games", lazy="noload")
    rounds: Mapped[list[Round]] = relationship(
        back_populates="game", cascade="all, delete-orphan", lazy="noload"
    )
    comment: Mapped[GameComment | None] = relationship(
        back_populates="game", cascade="all, delete-orphan", uselist=False, lazy="noload"
    )


class Round(TimestampMixin, Base):
    """A round within a game, made up of one or more ends."""

    __tablename__ = "rounds"

    game_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("games.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    recorded_at: Mapped[date] = mapped_column(Date)
    end_size: Mapped[int] = mapped_column(Integer)
    round_size: Mapped[int | None] = mapped_column(Integer, default=None)
    distance_m: Mapped[int] = mapped_column(Integer)
    # Target face, e.g. "122cm".
    target_type: Mapped[str] = mapped_column(String(50))

    game: Mapped[Game] = relationship(back_populates="rounds", lazy="noload")
    ends: Mapped[list[End]] = relationship(
        back_populates="round", cascade="all, delete-orphan", lazy="noload"
    )
    comment: Mapped[RoundComment | None] = relationship(
        back_populates="round", cascade="all, delete-orphan", uselist=False, lazy="noload"
    )


class End(TimestampMixin, Base):
    """An end within a round: a group of arrows shot together, each recorded as a Point."""

    __tablename__ = "ends"

    round_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rounds.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    recorded_at: Mapped[date] = mapped_column(Date)

    round: Mapped[Round] = relationship(back_populates="ends", lazy="noload")
    points: Mapped[list[Point]] = relationship(
        back_populates="end", cascade="all, delete-orphan", lazy="noload"
    )
    comment: Mapped[EndComment | None] = relationship(
        back_populates="end", cascade="all, delete-orphan", uselist=False, lazy="noload"
    )


class Point(TimestampMixin, Base):
    """A single arrow's result within an end: its score and where it hit the target."""

    __tablename__ = "points"

    end_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ends.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    score: Mapped[int] = mapped_column(Integer)
    # Hit position relative to the target center, e.g. in millimeters.
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    # x/y converted to real-world centimeters using the round's target_type
    # size at save time; null when the target size couldn't be resolved or
    # x/y carry no real position (see app.core.target_types).
    x_cm: Mapped[float | None] = mapped_column(Float, default=None)
    y_cm: Mapped[float | None] = mapped_column(Float, default=None)
    recorded_at: Mapped[date] = mapped_column(Date)
    # 入力の画面で矢を記録した時刻。それより前の記録・取り込んだ記録は null
    shot_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    end: Mapped[End] = relationship(back_populates="points", lazy="noload")
