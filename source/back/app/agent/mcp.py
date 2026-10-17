"""MCP(Model Context Protocol)のサーバー。

Claude・ChatGPT・Cursor などの AI が、本人のトークンで繋いで使う。
Streamable HTTP の POST に JSON で答えるだけにする(SSE の流し・セッションは持たない。
どのクライアントも JSON の応答を受けられる)。ツールは、この API の REST を中から呼び直す。
トークンで通る範囲(本人の記録を読む・AI コメントを書く)も、入力の検証も、REST と同じになる。
"""

import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from urllib.parse import urlencode

from app.agent.guide import mcp_instructions
from app.core.comments import MAX_AI_COMMENT_LENGTH

# 新しい順。クライアントが言うバージョンがこの中にあればそれで、無ければ先頭で答える
PROTOCOL_VERSIONS = (
    "2025-06-18",
    "2025-03-26",
    "2024-11-05",
)
SERVER_INFO = {"name": "archieves", "title": "archieves(アーチェリーのスコア)", "version": "1"}

# JSON-RPC のエラーの番号
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602


@dataclass(frozen=True)
class ApiRequest:
    """ツールが呼び直す REST の要求。path は /api/v1 から下"""

    method: str
    path: str
    query: dict[str, Any] = field(default_factory=dict)
    body: dict[str, Any] | None = None


@dataclass(frozen=True)
class ApiResponse:
    status: int
    data: Any


type CallApi = Callable[[ApiRequest], Awaitable[ApiResponse]]


class ToolArgumentError(ValueError):
    """ツールの引数が足りない・型が違う。AI が直せるよう、ツールの失敗として返す"""


def _int(args: dict[str, Any], name: str) -> int:
    value = args.get(name)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ToolArgumentError(f"{name} には整数を渡す")
    return value


def _optional(args: dict[str, Any], *names: str) -> dict[str, Any]:
    return {name: args[name] for name in names if args.get(name) is not None}


DATE_SCHEMA = {"type": "string", "format": "date", "description": "YYYY-MM-DD(日本時間の日付)"}


@dataclass(frozen=True)
class Tool:
    name: str
    title: str
    description: str
    input_schema: dict[str, Any]
    to_request: Callable[[dict[str, Any]], ApiRequest]
    read_only: bool = True

    def describe(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "inputSchema": self.input_schema,
            "annotations": {
                "readOnlyHint": self.read_only,
                "destructiveHint": False,
                "idempotentHint": True,
                "openWorldHint": False,
            },
        }


def _object(properties: dict[str, Any] | None = None, required: list[str] | None = None) -> dict:
    return {
        "type": "object",
        "properties": properties or {},
        "required": required or [],
        "additionalProperties": False,
    }


TOOLS = [
    Tool(
        name="get_profile",
        title="本人",
        description="接続している本人(名前・所属の id・公開範囲)。",
        input_schema=_object(),
        to_request=lambda args: ApiRequest("GET", "/users/me"),
    ),
    Tool(
        name="list_game_sheets",
        title="ゲームの記録(丸ごと)",
        description=(
            "ゲームの記録(ラウンド・エンド・矢・コメント・AIコメント)を丸ごと、新しい順に返す。"
            "recorded_on でその日のゲーム、until でその日まで(その日を含む)の直近 limit ゲーム。"
            "その日のスコアを直近と比べるときは、recorded_on と until+limit=30 の二回呼ぶ。"
        ),
        input_schema=_object(
            {
                "recorded_on": DATE_SCHEMA,
                "until": DATE_SCHEMA,
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 30},
            }
        ),
        to_request=lambda args: ApiRequest(
            "GET",
            "/games/sheets",
            _optional(args, "recorded_on", "until", "limit"),
        ),
    ),
    Tool(
        name="get_game_sheet",
        title="一つのゲームの記録",
        description=(
            "game_id のゲームの記録(ラウンド・エンド・矢・コメント・AIコメント)を丸ごと返す。"
        ),
        input_schema=_object({"game_id": {"type": "integer"}}, ["game_id"]),
        to_request=lambda args: ApiRequest("GET", f"/games/{_int(args, 'game_id')}/sheet"),
    ),
    Tool(
        name="list_games",
        title="ゲームの一覧",
        description="ゲームの一覧(記録の中身なし。id・日付・弓など)。year でその年に絞る。",
        input_schema=_object({"year": {"type": "integer"}}),
        to_request=lambda args: ApiRequest(
            "GET",
            "/games",
            {**_optional(args, "year"), "limit": 10000},
        ),
    ),
    Tool(
        name="list_game_years",
        title="ゲームのある年",
        description="ゲームのある年。新しい年が先。",
        input_schema=_object(),
        to_request=lambda args: ApiRequest("GET", "/games/years"),
    ),
    Tool(
        name="list_game_scores",
        title="年内のゲームごとの点",
        description="year の年のゲームごとの合計点・エンド平均・矢の平均。",
        input_schema=_object({"year": {"type": "integer"}}, ["year"]),
        to_request=lambda args: ApiRequest("GET", "/games/scores", {"year": _int(args, "year")}),
    ),
    Tool(
        name="get_score_statistics",
        title="期間の集計",
        description=(
            "期間(start〜end、両端を含む)の点の集計(件数・合計・最小・最大・平均・中央値)。"
            "target は rounds(ラウンドの合計)・ends(エンドの合計)・points(矢一本)。"
            "bow_type・distance_m・target_type で種別を絞れる。"
        ),
        input_schema=_object(
            {
                "target": {"type": "string", "enum": ["rounds", "ends", "points"]},
                "start": DATE_SCHEMA,
                "end": DATE_SCHEMA,
                "bow_type": {"type": "string"},
                "distance_m": {"type": "integer"},
                "target_type": {"type": "string"},
            },
            ["target"],
        ),
        to_request=lambda args: ApiRequest(
            "GET",
            f"/statistics/{_target(args)}/summary",
            _optional(args, "start", "end", "bow_type", "distance_m", "target_type"),
        ),
    ),
    Tool(
        name="list_diaries",
        title="日記",
        description="本人の日記。新しい順。year は日本時間の年、limit は件数。",
        input_schema=_object(
            {
                "year": {"type": "integer"},
                "limit": {"type": "integer", "minimum": 1},
            }
        ),
        to_request=lambda args: ApiRequest("GET", "/diaries", _optional(args, "year", "limit")),
    ),
    Tool(
        name="write_ai_comment",
        title="AIコメントを書く",
        description=(
            "game_id のゲームに AIコメント(指摘・改善点)を書く。スコアの画面の最後に出る。"
            "あれば上書きする。画面はマークダウンを解釈しないので、"
            "【見出し】と「・」の箇条書きの、ただの文で書く。"
        ),
        input_schema=_object(
            {
                "game_id": {"type": "integer"},
                "body": {"type": "string", "minLength": 1, "maxLength": MAX_AI_COMMENT_LENGTH},
            },
            ["game_id", "body"],
        ),
        to_request=lambda args: ApiRequest(
            "PUT",
            f"/games/{_int(args, 'game_id')}/ai-comment",
            body={"body": args.get("body")},
        ),
        read_only=False,
    ),
]
TOOLS_BY_NAME = {tool.name: tool for tool in TOOLS}


def _target(args: dict[str, Any]) -> str:
    target = args.get("target")
    if target not in ("rounds", "ends", "points"):
        raise ToolArgumentError("target は rounds・ends・points のどれか")
    return target


def _result(message_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": message_id, "result": result}


def error(message_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": message_id, "error": {"code": code, "message": message}}


def _tool_result(text: str, *, is_error: bool = False) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": text}], "isError": is_error}


async def _call_tool(params: dict[str, Any], call_api: CallApi) -> dict[str, Any] | str:
    """ツールの結果。名前が無いツールなら、JSON-RPC のエラーにする文を返す"""
    tool = TOOLS_BY_NAME.get(params.get("name", ""))
    if tool is None:
        return f"Unknown tool: {params.get('name')}"
    args = params.get("arguments") or {}
    if not isinstance(args, dict):
        return _tool_result("arguments はオブジェクトで渡す", is_error=True)
    try:
        request = tool.to_request(args)
    except ToolArgumentError as exc:
        return _tool_result(str(exc), is_error=True)
    response = await call_api(request)
    text = json.dumps(response.data, ensure_ascii=False)
    if response.status >= 400:
        return _tool_result(f"HTTP {response.status}: {text}", is_error=True)
    return _tool_result(text)


async def handle(message: Any, call_api: CallApi, now: datetime) -> dict[str, Any] | None:
    """JSON-RPC の一つのメッセージに答える。通知(id の無いもの)には答えない(None)"""
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
        return error(None, INVALID_REQUEST, "Invalid Request")
    if "id" not in message:
        return None
    message_id = message["id"]
    method = message.get("method")
    params = message.get("params") or {}
    if not isinstance(params, dict):
        return error(message_id, INVALID_PARAMS, "params must be an object")

    match method:
        case "initialize":
            requested = params.get("protocolVersion")
            return _result(
                message_id,
                {
                    "protocolVersion": (
                        requested if requested in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0]
                    ),
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": SERVER_INFO,
                    "instructions": mcp_instructions(now),
                },
            )
        case "ping":
            return _result(message_id, {})
        case "tools/list":
            return _result(message_id, {"tools": [tool.describe() for tool in TOOLS]})
        case "tools/call":
            result = await _call_tool(params, call_api)
            if isinstance(result, str):
                return error(message_id, INVALID_PARAMS, result)
            return _result(message_id, result)
        case _:
            return error(message_id, METHOD_NOT_FOUND, f"Method not found: {method}")


async def call_asgi(
    app: Callable[..., Awaitable[None]],
    request: ApiRequest,
    headers: dict[str, str],
    prefix: str,
) -> ApiResponse:
    """ASGI のアプリ(この API 自身)を、同じプロセスの中で HTTP の要求として呼ぶ。

    httpx などを本番の依存に足さずに済ませるため、ASGI の scope を手で組む。
    """
    body = b"" if request.body is None else json.dumps(request.body).encode()
    path = prefix + request.path
    raw_headers = [(name.lower().encode(), value.encode()) for name, value in headers.items()]
    if request.body is not None:
        raw_headers.append((b"content-type", b"application/json"))
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": request.method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": urlencode(request.query, doseq=True).encode(),
        "root_path": "",
        "headers": raw_headers,
        "client": ("127.0.0.1", 0),
        "server": ("archieves-mcp", 80),
    }
    # 本文を一度渡したら、あとは切れたことにする
    messages = iter([{"type": "http.request", "body": body, "more_body": False}])

    async def receive() -> dict[str, Any]:
        return next(messages, {"type": "http.disconnect"})

    status = 500
    chunks: list[bytes] = []

    async def send(message: dict[str, Any]) -> None:
        nonlocal status
        if message["type"] == "http.response.start":
            status = message["status"]
        elif message["type"] == "http.response.body":
            chunks.append(message.get("body", b""))

    await app(scope, receive, send)
    raw = b"".join(chunks)
    try:
        data = json.loads(raw) if raw else None
    except ValueError:
        data = raw.decode(errors="replace")
    return ApiResponse(status, data)
