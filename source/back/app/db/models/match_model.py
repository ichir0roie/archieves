from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    FetchedValue,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.match_codes import MATCH_ID_LENGTH
from app.db.base_class import Base

if TYPE_CHECKING:
    from app.db.models.game_model import Game
    from app.db.models.system_model import User


class Match(Base):
    """試合。だれかが日時と矢の数を決めて作り、参加する人はその id でゲームを始める。

    揃えるのはラウンド数(game_size)・1 ラウンドのエンド数(round_size)・1 エンドの矢数(end_size)と
    日時だけ。弓・距離・的・矢の直径・インサイドアウトは人ごとに選ぶ
    (games.match_id がこの試合を指す)。

    id は人が打ち写して共有するので、連番でなく推測されにくいコードにする。そのため TimestampMixin
    (bigint の id)は使わず、同じ時刻の欄をここに書く。
    """

    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(MATCH_ID_LENGTH), primary_key=True)
    # 作った人。利用者の行が消えても、参加した人のゲームから試合を引けるよう、試合は残す
    organizer_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    held_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    game_size: Mapped[int] = mapped_column(Integer)
    round_size: Mapped[int] = mapped_column(Integer)
    end_size: Mapped[int] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # 更新のたびに db のトリガー(set_updated_at)が書き換える
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), server_onupdate=FetchedValue()
    )
    deleted_at: Mapped[date | None] = mapped_column(Date, default=None)

    organizer: Mapped[User | None] = relationship(lazy="noload")
    games: Mapped[list[Game]] = relationship(back_populates="match", lazy="noload")
