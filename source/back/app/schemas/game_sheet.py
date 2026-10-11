"""ゲームの記録を丸ごと一度に読み書きする形(PUT /games/sheet・GET /games/{game_id}/sheet)。

入力の画面は記録を手元に溜め、保存・終了のときにこの形でまとめて送る。id の無いラウンド・エンド・
矢は作り、id のあるものはその行を上書きする。送られなかった子(今あるのに送られてこないもの)は消す。
"""

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.core.comments import MAX_COMMENT_LENGTH
from app.core.scoring import (
    MISS_SCORE,
    X_SCORE,
)
from app.core.target_types import TARGET_TYPE_MAX_LENGTH
from app.schemas.base import ResponseModel
from app.schemas.game import GameWriteFields, PointRead, RoundWriteFields

# 取り込んだ古い記録は、画面で作れる数(MAX_*)より多いラウンド・エンド・矢を持つことがある。
# 読み込んだものをそのまま送り返せるよう、上限は少し広く取る
_MAX_ITEMS = 1000


class PointSheetWrite(BaseModel):
    id: int | None = None
    number: int = Field(ge=1)
    score: int = Field(ge=MISS_SCORE, le=X_SCORE)
    # 的の枠の中の位置(0-1、左上が原点)。(0, 0) は位置なし
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    recorded_at: date
    shot_at: datetime | None = None


class EndSheetWrite(BaseModel):
    id: int | None = None
    number: int = Field(ge=1)
    recorded_at: date
    # null か空白だけなら、あるコメントを消す
    comment: str | None = Field(default=None, max_length=MAX_COMMENT_LENGTH)
    points: list[PointSheetWrite] = Field(default=[], max_length=_MAX_ITEMS)


class RoundSheetWrite(RoundWriteFields):
    id: int | None = None
    # 決まった的の種類かは、新しいラウンドと値を変えたときだけ確かめる(services/game_sheet.py)。
    # 取り込んだ古いラウンドは外の値を持つので、読んだまま送り返せるようにする
    target_type: str = Field(min_length=1, max_length=TARGET_TYPE_MAX_LENGTH)
    comment: str | None = Field(default=None, max_length=MAX_COMMENT_LENGTH)
    ends: list[EndSheetWrite] = Field(default=[], max_length=_MAX_ITEMS)


class GameSheetWrite(GameWriteFields):
    # 無ければ新しいゲーム。client_key が同じゲームがあれば、それを上書きする
    id: int | None = None
    client_key: str | None = Field(default=None, min_length=1, max_length=64)
    comment: str | None = Field(default=None, max_length=MAX_COMMENT_LENGTH)
    rounds: list[RoundSheetWrite] = Field(default=[], max_length=_MAX_ITEMS)


class EndSheetRead(ResponseModel):
    id: int
    number: int
    recorded_at: date
    comment: str | None
    points: list[PointRead]


class RoundSheetRead(ResponseModel):
    id: int
    number: int
    recorded_at: date
    end_size: int
    round_size: int | None
    distance_m: int
    # 取り込んだ古い記録は、決まった的の種類の外の値を持つことがある
    target_type: str
    comment: str | None
    ends: list[EndSheetRead]


class GameSheetRead(ResponseModel):
    id: int
    client_key: str | None
    user_id: int
    recorded_at: date
    game_size: int | None
    bow_type: str | None
    arrow_diameter_mm: int | None
    all_in: bool
    backfilled: bool
    comment: str | None
    rounds: list[RoundSheetRead]
