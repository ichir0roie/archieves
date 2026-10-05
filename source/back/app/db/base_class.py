from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    """Common columns for every table: a bigint id plus creation/soft-delete timestamps."""

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[date | None] = mapped_column(Date, default=None)
