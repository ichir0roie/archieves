from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, FetchedValue, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    """Common columns for every table: a bigint id plus creation/soft-delete timestamps."""

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # 更新のたびに db のトリガー(set_updated_at。マイグレーション a3d9f0b6c214)が書き換える。
    # FetchedValue で、UPDATE のあとに ORM がこの列を読み直す
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), server_onupdate=FetchedValue()
    )
    deleted_at: Mapped[date | None] = mapped_column(Date, default=None)
