"""Archery scoring rules shared by every aggregation.

`points.score` stores the ring an arrow landed in, not the points it is
worth:

- `11` is X (the inner ten). It is worth 10 points; the X count itself only
  ever breaks ties, so it must never be summed as 11.
- `0` is M (a miss), worth nothing.
- Legacy backups (see app.services.legacy_import) can carry negative scores
  for arrows the old client never resolved a ring for; they are misses too.

`scored_value` is the single place that turns a stored ring into points, so
the API's totals/averages agree with what the score sheet shows.
"""

from sqlalchemy.sql import ColumnElement, case

X_SCORE = 11
MISS_SCORE = 0
MAX_RING_SCORE = 10


def scored_value(score: int) -> int:
    """The points a stored ring is worth."""
    if score >= X_SCORE:
        return MAX_RING_SCORE
    if score <= MISS_SCORE:
        return MISS_SCORE
    return score


def scored_value_column(column: ColumnElement[int]) -> ColumnElement[int]:
    """`scored_value` as SQL, for summing/averaging a score column."""
    return case(
        (column >= X_SCORE, MAX_RING_SCORE),
        (column <= MISS_SCORE, MISS_SCORE),
        else_=column,
    )


# Structural limits for a game, in the units the score sheet uses: arrows per
# end, ends per round, rounds per game. 設定画面のプルダウン(1〜100)と揃える。
MAX_END_SIZE = 100
MAX_ROUND_SIZE = 100
MAX_GAME_SIZE = 100
MAX_DISTANCE_M = 100

# 矢の直径(mm)。記入画面は、的の実寸と画面の大きさの比で px に直し、その円が少しでも
# 帯の線にかかれば高い方の点にする(インサイドアウトでは低い方)。
# フロントの scoreConfig.ts の MIN/MAX_ARROW_DIAMETER_MM と揃える
MIN_ARROW_DIAMETER_MM = 1
MAX_ARROW_DIAMETER_MM = 30
