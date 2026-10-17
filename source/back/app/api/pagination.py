"""一覧のエンドポイントの skip・limit。

負の値は db の例外(500)になり、大きすぎる limit は重いので、要求の形で弾く。
"""

from typing import Annotated

from fastapi import Query

# 年のゲームを全部読む画面(スコアの一覧)が 10000 を渡す
MAX_LIMIT = 10000

Skip = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=MAX_LIMIT)]
