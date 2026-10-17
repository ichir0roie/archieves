"""Claude などの AI に、トークンで API を使う手順を渡す(agent_guide.md)。

openapi.json は大きいので、まずこれを読ませる。中身は使い方だけで本人のデータを含まないので、
ログインを求めない(本番では API の合言葉と、フロントの route handler のログインかトークンは要る)。
"""

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

AGENT_GUIDE = (Path(__file__).resolve().parent.parent / "agent_guide.md").read_text(
    encoding="utf-8"
)

router = APIRouter()


@router.get("/guide", response_class=PlainTextResponse)
def get_agent_guide() -> PlainTextResponse:
    """Claude などの AI 向けの、この API の使い方(Markdown)。"""
    return PlainTextResponse(AGENT_GUIDE, media_type="text/markdown; charset=utf-8")
