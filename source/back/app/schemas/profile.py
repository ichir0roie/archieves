from datetime import date

from app.schemas.base import ResponseModel
from app.schemas.diary import DiaryRead
from app.schemas.organization import OrganizationSummary
from app.schemas.statistics import ScoreStatistics


class PublicUserRead(ResponseModel):
    """他人に見せる利用者。Cognito の sub・公開範囲・管理者かどうかは載せない。"""

    id: int
    name: str
    nickname: str | None
    organization: OrganizationSummary | None


class UserProfile(ResponseModel):
    """利用者のプロフィール(GET /public/users/{user_id}/profile)。

    基本情報と、直近のゲームの集計・スコア・日記。

    recent_game_ids・recent_diaries は、持ち主のスコア・日記の公開範囲が見る人に見せないとき None。
    """

    user: PublicUserRead
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
