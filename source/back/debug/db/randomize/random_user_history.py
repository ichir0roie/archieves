"""一人の利用者に、何年分もの練習の試合を乱数で足す(画面の確かめ用。スコアログ・統計・年の切り替え)。

腕前は年を追って少しずつ上がり、日によってぶれる。矢の点数は的の上の位置から決めるので、
点数と着弾の位置(x・y)が食い違わない。行が数万になるので、factory ではなくまとめて insert する。
"""

import logging
import math
import random
from datetime import date, timedelta

from sqlalchemy import insert

from app.core.bow_types import BowType
from app.core.scoring import MAX_RING_SCORE, MISS_SCORE, X_SCORE
from app.core.target_types import get_target_type
from app.crud.game import point_cm
from app.db.models.game_model import End, Game, Point, Round
from app.db.models.system_model import User
from mods.factory_db import FactorySession

logger = logging.getLogger(__name__)

# 練習する日の割合(週に 2〜3 回)
PRACTICE_RATE = 0.35
ENDS_PER_ROUND = 6
ARROWS_PER_END = 6
# 距離と的の組み合わせと、その重み
ROUND_KINDS = [
    (70, "122cm", 6),
    (50, "122cm", 2),
    (30, "80cm", 2),
]
# 70m での着弾のばらつき(的の上の cm、標準偏差)。始めの年から終わりの年へ、この幅で上達する
SPREAD_CM_START = 14.0
SPREAD_CM_END = 6.0


def _score(r_cm: float, size_cm: float) -> int:
    """中心からの距離で輪を決める。どの的も 1〜10 の輪を持ち、X は 10 の輪の内側半分。"""
    ring_width = size_cm / 2 / MAX_RING_SCORE
    if r_cm < ring_width / 2:
        return X_SCORE
    ring = MAX_RING_SCORE - math.floor(r_cm / ring_width)
    return ring if ring >= 1 else MISS_SCORE


def _arrow(
    rng: random.Random,
    spread_cm: float,
    size_cm: float,
) -> tuple[int, float, float]:
    """一本の矢の点数と、的の上の位置(左上を 0、右下を 1 とした割合)。"""
    dx = rng.gauss(0, spread_cm)
    dy = rng.gauss(0, spread_cm)
    score = _score(math.hypot(dx, dy), size_cm)
    # 的の外の矢も、的の縁に置く(画面は的の上にしか描けない)
    x = min(max(0.5 + dx / size_cm, 0.001), 0.999)
    y = min(max(0.5 + dy / size_cm, 0.001), 0.999)
    return score, x, y


def create_user_history(user: User, years: int = 5, seed: int | None = None) -> None:
    """user に、今日までの years 年分の試合・ラウンド・エンド・点を足してコミットする。"""
    rng = random.Random(seed)
    s = FactorySession()
    today = date.today()
    start = today - timedelta(days=365 * years)
    total_days = (today - start).days
    bow_type = rng.choice(list(BowType))

    days = [
        start + timedelta(days=i)
        for i in range(total_days + 1)
        if rng.random() < PRACTICE_RATE
    ]
    games = [
        Game(
            user_id=user.id,
            recorded_at=day,
            game_size=rng.choice([1, 2, 2, 3]),
            bow_type=bow_type,
        )
        for day in days
    ]
    s.add_all(games)
    s.flush()

    rounds: list[tuple[Round, float]] = []
    for game in games:
        progress = (game.recorded_at - start).days / total_days
        # 調子の良い日・悪い日
        base_spread = SPREAD_CM_START + (SPREAD_CM_END - SPREAD_CM_START) * progress
        day_spread = base_spread * rng.uniform(0.8, 1.25)
        for number in range(1, (game.game_size or 1) + 1):
            distance_m, target_type, _ = rng.choices(
                ROUND_KINDS,
                weights=[k[2] for k in ROUND_KINDS],
            )[0]
            round_ = Round(
                game_id=game.id,
                user_id=user.id,
                number=number,
                recorded_at=game.recorded_at,
                end_size=ENDS_PER_ROUND,
                round_size=game.game_size,
                distance_m=distance_m,
                target_type=target_type,
            )
            # 近い距離ほど的の上のばらつきは小さい
            rounds.append((round_, day_spread * distance_m / 70))
    s.add_all([r for r, _ in rounds])
    s.flush()

    ends: list[tuple[End, Round, float]] = []
    for round_, spread_cm in rounds:
        for number in range(1, ENDS_PER_ROUND + 1):
            end = End(
                round_id=round_.id,
                user_id=user.id,
                number=number,
                recorded_at=round_.recorded_at,
            )
            ends.append((end, round_, spread_cm))
    s.add_all([e for e, _, _ in ends])
    s.flush()

    points = []
    for end, round_, spread_cm in ends:
        target = get_target_type(round_.target_type)
        assert target is not None
        for number in range(1, ARROWS_PER_END + 1):
            score, x, y = _arrow(rng, spread_cm, target.size_cm)
            x_cm, y_cm = point_cm(round_, x, y)
            points.append(
                {
                    "end_id": end.id,
                    "user_id": user.id,
                    "number": number,
                    "score": score,
                    "x": x,
                    "y": y,
                    "x_cm": x_cm,
                    "y_cm": y_cm,
                    "recorded_at": end.recorded_at,
                }
            )
    s.execute(insert(Point), points)
    s.commit()
    logger.info(
        f"{user.sub} に {start}〜{today} の試合 {len(games)}・ラウンド {len(rounds)}"
        f"・点 {len(points)} を足した"
    )
