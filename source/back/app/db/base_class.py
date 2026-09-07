from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Integer, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# SQLite only treats a column as its rowid-aliased autoincrementing key when
# it's declared exactly INTEGER; BIGINT would silently stop autoincrementing
# there. Postgres keeps the real BIGINT.
BigIntegerPK = BigInteger().with_variant(Integer, "sqlite")


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    """Common columns for every table: a bigint id plus creation/soft-delete timestamps."""

    id: Mapped[int] = mapped_column(BigIntegerPK, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[date | None] = mapped_column(Date, default=None)
