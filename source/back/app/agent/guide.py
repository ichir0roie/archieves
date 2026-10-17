"""AI に渡す、この API の使い方。

REST 向け(GET /api/v1/guide)と MCP 向け(initialize の instructions)は、記録の読み方・
AI コメントの書き方(records.md)を共にし、繋ぎ方の部分だけを分ける。
"""

from datetime import datetime
from pathlib import Path

from app.core.timezone import JST

_DIR = Path(__file__).resolve().parent


def _read(name: str) -> str:
    return (_DIR / name).read_text(encoding="utf-8")


_REST = _read("rest.md")
_MCP = _read("mcp.md")
_RECORDS = _read("records.md")


def _now_line(now: datetime) -> str:
    # AI は今日の日付を知らないことがあるので、「今日のスコア」を決められるよう添える
    return f"今の日本時間: {now.astimezone(JST):%Y-%m-%d %H:%M}\n\n"


def rest_guide(now: datetime) -> str:
    return _REST + _now_line(now) + _RECORDS


def mcp_instructions(now: datetime) -> str:
    return _MCP + _now_line(now) + _RECORDS
