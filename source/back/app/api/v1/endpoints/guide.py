"""AI に、トークンで REST の API を使う手順を渡す(app/agent/rest.md・records.md)。

openapi.json は大きいので、まずこれを読ませる。中身は使い方だけで本人のデータを含まないので、
ログインを求めない(本番では API の合言葉と、フロントの route handler のログインかトークンは要る)。
"""

from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from app.agent.guide import rest_guide

router = APIRouter()


@router.get("/guide", response_class=PlainTextResponse)
def get_agent_guide() -> PlainTextResponse:
    """AI 向けの、この API の使い方(Markdown)。"""
    return PlainTextResponse(
        rest_guide(datetime.now(UTC)),
        media_type="text/markdown; charset=utf-8",
    )
