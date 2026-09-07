from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, BigIntegerPK, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.system_model import User


class Game(TimestampMixin, Base):
    """An archery session/competition, made up of one or more rounds."""

    __tablename__ = "games"

    user_id: Mapped[int] = mapped_column(
        BigIntegerPK, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    recorded_at: Mapped[date] = mapped_column(Date)

    # How many rounds the player set up for this game before recording started.
    game_size: Mapped[int | None] = mapped_column(Integer, default=None)

    user: Mapped[User] = relationship(back_populates="games", lazy="noload")
    rounds: Mapped[list[Round]] = relationship(
        back_populates="game", cascade="all, delete-orphan", lazy="noload"
    )
    match: Mapped[Match | None] = relationship(
        back_populates="game", cascade="all, delete-orphan", uselist=False, lazy="noload"
    )


class Round(TimestampMixin, Base):
    """A round within a game, made up of one or more ends."""

    __tablename__ = "rounds"

    game_id: Mapped[int] = mapped_column(
        BigIntegerPK, ForeignKey("games.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigIntegerPK, ForeignKey("users.id", ondelete="CASCADE"), index=True
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


class End(TimestampMixin, Base):
    """An end within a round: a group of arrows shot together, each recorded as a Point."""

    __tablename__ = "ends"

    round_id: Mapped[int] = mapped_column(
        BigIntegerPK, ForeignKey("rounds.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigIntegerPK, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    recorded_at: Mapped[date] = mapped_column(Date)

    round: Mapped[Round] = relationship(back_populates="ends", lazy="noload")
    points: Mapped[list[Point]] = relationship(
        back_populates="end", cascade="all, delete-orphan", lazy="noload"
    )


class Match(TimestampMixin, Base):
    """Competition metadata attached to a Game: its name and an optional related link."""

    __tablename__ = "matches"

    game_id: Mapped[int] = mapped_column(
        BigIntegerPK, ForeignKey("games.id", ondelete="CASCADE"), unique=True, index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigIntegerPK, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    link: Mapped[str | None] = mapped_column(String(500), default=None)

    game: Mapped[Game] = relationship(back_populates="match", lazy="noload")


class Point(TimestampMixin, Base):
    """A single arrow's result within an end: its score and where it hit the target."""

    __tablename__ = "points"

    end_id: Mapped[int] = mapped_column(
        BigIntegerPK, ForeignKey("ends.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigIntegerPK, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    score: Mapped[int] = mapped_column(Integer)
    # Hit position relative to the target center, e.g. in millimeters.
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    recorded_at: Mapped[date] = mapped_column(Date)

    end: Mapped[End] = relationship(back_populates="points", lazy="noload")
