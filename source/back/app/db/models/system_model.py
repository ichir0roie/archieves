from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, String, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.game_model import Game


class Organization(TimestampMixin, Base):
    """A group a user can belong to, e.g. an archery club or team."""

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(100))
    formal_name: Mapped[str | None] = mapped_column(String(200), default=None)
    description: Mapped[str | None] = mapped_column(String(500), default=None)
    homepage_url: Mapped[str | None] = mapped_column(String(500), default=None)
    location: Mapped[str | None] = mapped_column(String(200), default=None)

    parent_organization_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("organizations.id", ondelete="SET NULL"), index=True, default=None
    )

    parent_organization: Mapped[Organization | None] = relationship(
        remote_side="Organization.id", back_populates="child_organizations", lazy="joined"
    )
    child_organizations: Mapped[list[Organization]] = relationship(
        back_populates="parent_organization", lazy="noload"
    )
    users: Mapped[list[User]] = relationship(back_populates="organization", lazy="noload")


class Region(TimestampMixin, Base):
    """A region a user can belong to, e.g. a prefecture or state."""

    __tablename__ = "regions"

    name: Mapped[str] = mapped_column(String(100))

    users: Mapped[list[User]] = relationship(back_populates="region", lazy="noload")


class User(TimestampMixin, Base):
    __tablename__ = "users"

    sub: Mapped[str | None] = mapped_column(String(100), unique=True, index=True, default=None)
    name: Mapped[str] = mapped_column(String(50))
    nickname: Mapped[str | None] = mapped_column(String(100), default=None)

    organization_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("organizations.id", ondelete="SET NULL"), index=True, default=None
    )

    birth_date: Mapped[date | None] = mapped_column(Date, default=None)

    region_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("regions.id", ondelete="SET NULL"), index=True, default=None
    )

    # 管理者は画面から付け外しせず、db の行を直に書き換えて決める。
    # 直に INSERT しても埋まるよう、既定は db の側にも置く
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    organization: Mapped[Organization | None] = relationship(
        back_populates="users", lazy="noload"
    )
    region: Mapped[Region | None] = relationship(back_populates="users", lazy="noload")
    games: Mapped[list[Game]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="noload"
    )
