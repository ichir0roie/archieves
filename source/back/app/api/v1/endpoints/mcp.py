"""MCP(Model Context Protocol)の口。AI のクライアントが、本人のトークンで繋ぐ(app/agent/mcp.py)。"""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse

from app.agent import mcp
from app.api import deps
from app.core.api_keys import API_KEY_HEADER
from app.core.config import settings
from app.core.security import ACCESS_TOKEN_HEADER
from app.db import AccessToken, User

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/mcp")
async def handle_mcp(
    request: Request,
    found: tuple[AccessToken, User] = Depends(deps.require_access_token),
) -> Response:
    """MCP の Streamable HTTP。JSON-RPC のメッセージを一つ受け、JSON で答える(通知には 202)。

    SSE の流し(GET)とセッションは持たない。
    """
    try:
        message = await request.json()
    except ValueError:
        return JSONResponse(mcp.error(None, mcp.PARSE_ERROR, "Parse error"), status_code=400)

    # ツールが呼び直す REST にも、同じトークンと合言葉を付ける(どこまで通すかは REST が決める)
    headers = {ACCESS_TOKEN_HEADER: request.headers[ACCESS_TOKEN_HEADER]}
    if api_key := request.headers.get(API_KEY_HEADER):
        headers[API_KEY_HEADER] = api_key

    async def call_api(api_request: mcp.ApiRequest) -> mcp.ApiResponse:
        return await mcp.call_asgi(request.app, api_request, headers, settings.API_V1_STR)

    if isinstance(message, dict) and message.get("method") == "tools/call":
        tool = (message.get("params") or {}).get("name")
        logger.info(f"mcp tools/call {tool} by access token {found[0].id}")
    response = await mcp.handle(message, call_api, datetime.now(UTC))
    if response is None:
        return Response(status_code=202)
    return JSONResponse(response)
