"""試合(POST /matches・GET/PATCH /matches/{match_id}・GET /matches/{match_id}/result)の形。"""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.matches import MATCH_DESCRIPTION_MAX_LENGTH, MATCH_TITLE_MAX_LENGTH
from app.core.scoring import MAX_END_SIZE, MAX_GAME_SIZE, MAX_ROUND_SIZE
from app.schemas.base import ResponseModel
from app.schemas.statistics import RankedUser


class MatchSettings(BaseModel):
    """試合で揃えるもの。ゲームのラウンド数(game_size)と、ラウンドのエンド数(round_size)・
    エンドの矢数(end_size)。弓・距離・的・矢の直径・インサイドアウトは人ごとに選ぶ。"""

    game_size: int
    round_size: int
    end_size: int


def _blank_to_none(value: object) -> object:
    """前後の空白を落とし、空になれば null にする(空のタイトルを「無い」と同じに扱う)。"""
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


class MatchInfo(BaseModel):
    """作った人が付けるタイトルと内容(説明)。どちらも省ける。"""

    title: str | None = Field(default=None, max_length=MATCH_TITLE_MAX_LENGTH)
    description: str | None = Field(default=None, max_length=MATCH_DESCRIPTION_MAX_LENGTH)

    @field_validator("title", "description", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        return _blank_to_none(value)


class MatchCreate(MatchSettings, MatchInfo):
    # 省けば作った時
    held_at: datetime | None = None
    game_size: int = Field(ge=1, le=MAX_GAME_SIZE)
    round_size: int = Field(ge=1, le=MAX_ROUND_SIZE)
    end_size: int = Field(ge=1, le=MAX_END_SIZE)


class MatchUpdate(MatchInfo):
    """作った人がタイトル・内容を直す。省いた欄はそのまま、null(空)で消す。"""


class MatchRead(MatchSettings, ResponseModel):
    # 参加のコード(app/core/match_codes.py)
    id: str
    held_at: datetime
    title: str | None
    description: str | None
    # 作った人。利用者の行が消えていれば null
    organizer: RankedUser | None
    # 試合のゲーム(矢が一本でもあるもの。消したゲームは数えない)の数
    game_count: int
    # 読んだ人から見た試合。自分が作ったか、自分のゲーム(消したものは除く)がいくつあるか
    organized_by_me: bool
    my_game_count: int


class MatchEntry(ResponseModel):
    """試合の結果の一行。ゲームごと(同じ人が二つ記録すれば二行)。"""

    rank: int
    game_id: int
    user: RankedUser
    # 弓と距離は人ごとに違う。距離はラウンドで違えば一番遠いもの
    bow_type: str | None
    distance_m: int
    total_score: int
    arrow_count: int
    x_count: int
    # X を除く 10 点の本数
    ten_count: int
    miss_count: int
    # 矢 1 本の平均点
    point_average: float
    # 偏差値(50 + 10 × (合計点 − 平均) / 標準偏差)。全員が同じ点なら 50
    deviation_score: float


class MatchStatistics(ResponseModel):
    """試合のゲームの合計点の集計。ゲームが無ければ件数 0 で、ほかは null。"""

    count: int
    average: float | None
    # 母標準偏差(偏差値と同じもの)
    standard_deviation: float | None
    median: float | None
    max: int | None
    min: int | None


class MatchResult(ResponseModel):
    match: MatchRead
    statistics: MatchStatistics
    # 合計点の高い順。同点は 10 点(X を含む)の本数、X の本数の多い順。それも同じなら同じ順位
    entries: list[MatchEntry]
