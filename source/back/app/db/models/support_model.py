from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.support import (
    MAX_ANNOUNCEMENT_LENGTH,
    MAX_EMAIL_LENGTH,
    MAX_ERROR_KIND_LENGTH,
    MAX_ERROR_MESSAGE_LENGTH,
    MAX_ERROR_METHOD_LENGTH,
    MAX_ERROR_PATH_LENGTH,
    MAX_FEEDBACK_LENGTH,
)
from app.db.base_class import Base, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.system_model import User


class Feedback(TimestampMixin, Base):
    """意見箱に届いた問い合わせと、運営からの返信。問い合わせの日時は created_at。"""

    __tablename__ = "feedbacks"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # 返信の宛先。users は email を持たないので、送った時点の値をここに残す
    email: Mapped[str | None] = mapped_column(String(MAX_EMAIL_LENGTH), default=None)
    body: Mapped[str] = mapped_column(String(MAX_FEEDBACK_LENGTH))
    # 返信は管理者が PUT /admin/feedbacks/{feedback_id}/reply で書く
    reply: Mapped[str | None] = mapped_column(String(MAX_FEEDBACK_LENGTH), default=None)
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    user: Mapped[User] = relationship(lazy="noload")


class Announcement(TimestampMixin, Base):
    """お知らせ。運営が db に直に書く。published_at が先の日時の行は、その時まで出さない。"""

    __tablename__ = "announcements"

    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    body: Mapped[str] = mapped_column(String(MAX_ANNOUNCEMENT_LENGTH))


class ErrorReport(TimestampMixin, Base):
    """フロントで起きたエラー(無いページ・API のエラー)。起きた日時は created_at。"""

    __tablename__ = "error_reports"

    # 登録の前の利用者からも届くので空を許す
    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True, default=None
    )
    # ErrorReportKind
    kind: Mapped[str] = mapped_column(String(MAX_ERROR_KIND_LENGTH))
    # HTTP のステータス。無いページは 404
    status_code: Mapped[int] = mapped_column(Integer)
    # エラーが起きたときに開いていたページ
    page_path: Mapped[str] = mapped_column(String(MAX_ERROR_PATH_LENGTH))
    # API のエラーのときだけ
    method: Mapped[str | None] = mapped_column(String(MAX_ERROR_METHOD_LENGTH), default=None)
    api_path: Mapped[str | None] = mapped_column(String(MAX_ERROR_PATH_LENGTH), default=None)
    message: Mapped[str | None] = mapped_column(String(MAX_ERROR_MESSAGE_LENGTH), default=None)
    # 管理者が PUT /admin/error-reports/{error_report_id}/resolve で書く。空なら未対応
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None, index=True
    )

    user: Mapped[User | None] = relationship(lazy="noload")
