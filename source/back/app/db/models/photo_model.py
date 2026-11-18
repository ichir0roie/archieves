from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.game_model import End


class EndPhoto(TimestampMixin, Base):
    """写真モードで、エンドごとに撮った的の写真と、それを処理した結果。

    元の写真は置き場(S3)にそのまま残し、ここには置き場のキーと処理の結果だけを持つ。
    一つのエンドに一枚。撮り直すと行ごと作り直す。
    """

    __tablename__ = "end_photos"

    end_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ends.id", ondelete="CASCADE"), unique=True, index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # app/core/photos.py の PhotoStatus
    status: Mapped[str] = mapped_column(String(16))
    content_type: Mapped[str] = mapped_column(String(32))
    original_key: Mapped[str] = mapped_column(String(255))
    # 画面に出す画像(長辺を縮め、向きを直したもの。補正できたときは的を正面から見た形)
    display_key: Mapped[str | None] = mapped_column(String(255), default=None)
    # 向きを直したあとの元の写真の大きさ(px)
    width: Mapped[int | None] = mapped_column(Integer, default=None)
    height: Mapped[int | None] = mapped_column(Integer, default=None)
    # 表示の画像を、的を正面から見た形に補正できた。そのとき表示の画像は、的に対する割合で
    # -display_extent から 1 + display_extent までの正方形(的の外に外れた矢も写すため)
    rectified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    display_extent: Mapped[float | None] = mapped_column(Float, default=None)
    # 元の写真の px を、的に対する割合(左上が 0、中心が 0.5)へ写す 3x3 の行列。
    # 補正できなければ null。
    # 推測と人の直した位置を、あとで学習・評価に使うときの手がかりに残す
    homography: Mapped[list[list[float]] | None] = mapped_column(JSON, default=None)
    # 人が手で合わせた 4 点(target_detection.ALIGNMENT_TARGET_POINTS の順)。向きを直した元の写真の
    # 幅・高さに対する割合。あれば、処理し直すときも的を探さずにこの 4 点で補正する
    alignment_points: Mapped[list[list[float]] | None] = mapped_column(JSON, default=None)
    # 推測した矢の位置。[{"x", "y", "confidence"}]。x・y は的に対する割合
    estimates: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, default=None)
    analyzer_version: Mapped[str | None] = mapped_column(String(32), default=None)
    # 処理に失敗したときの理由
    error: Mapped[str | None] = mapped_column(String(255), default=None)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    end: Mapped[End] = relationship(back_populates="photo", lazy="noload")
