from datetime import date

from app.schemas.base import ResponseModel
from app.schemas.diary import DiaryRead
from app.schemas.statistics import ScoreStatistics
from app.schemas.user import UserRead


class UserProfile(ResponseModel):
    """利用者のプロフィール。基本情報と、直近のゲームの集計・スコア・日記。

    recent_game_ids・recent_diaries は、持ち主のスコア・日記の公開範囲が見る人に見せないとき None。
    """

    user: UserRead
    # 集計に入れた直近のゲームの数と、その日付の幅。ゲームが無ければ日付は None
    game_count: int
    period_start: date | None
    period_end: date | None
    rounds: ScoreStatistics
    ends: ScoreStatistics
    points: ScoreStatistics
    # スコアの公開ページにまとめて載せるゲーム。新しい順
    recent_game_ids: list[int] | None
    recent_diaries: list[DiaryRead] | None
