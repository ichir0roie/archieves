"""MCP(app/agent/mcp.py)。

AI のクライアントが本人のトークンで繋ぎ、ツールで記録を読み、AI コメントを書く。
"""

import asyncio
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.agent import mcp
from app.core.api_keys import API_KEY_HEADER
from app.core.comments import MAX_AI_COMMENT_LENGTH
from app.core.security import ACCESS_TOKEN_HEADER
from app.main import app

URL = "/api/v1/mcp"


def _rpc(client: TestClient, method: str, params: dict | None = None, message_id: int = 1) -> dict:
    message: dict = {"jsonrpc": "2.0", "id": message_id, "method": method}
    if params is not None:
        message["params"] = params
    response = client.post(URL, json=message)
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == message_id
    return body


def _call(client: TestClient, name: str, arguments: dict | None = None) -> dict:
    return _rpc(client, "tools/call", {"name": name, "arguments": arguments or {}})["result"]


@pytest.mark.parametrize(
    ("requested", "answered"),
    [
        ("2025-03-26", "2025-03-26"),
        ("1999-01-01", mcp.PROTOCOL_VERSIONS[0]),
    ],
)
def test_initialize_tells_how_to_use_the_tools(
    token_client: TestClient, requested: str, answered: str
) -> None:
    result = _rpc(token_client, "initialize", {"protocolVersion": requested})["result"]

    assert result["protocolVersion"] == answered
    assert result["serverInfo"]["name"] == "archieves"
    assert "tools" in result["capabilities"]
    # リポジトリや Skill が無くても、繋げば使い方が AI に伝わる
    assert "list_game_sheets" in result["instructions"]
    assert "write_ai_comment" in result["instructions"]
    assert "今の日本時間" in result["instructions"]
    assert "x_cm" in result["instructions"]


def test_a_notification_gets_no_body(token_client: TestClient) -> None:
    response = token_client.post(
        URL,
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
    )

    assert response.status_code == 202
    assert response.content == b""


def test_ping_and_tools_list(token_client: TestClient) -> None:
    assert _rpc(token_client, "ping")["result"] == {}

    tools = _rpc(token_client, "tools/list")["result"]["tools"]

    assert {tool["name"] for tool in tools} == set(mcp.TOOLS_BY_NAME)
    writes = [tool["name"] for tool in tools if not tool["annotations"]["readOnlyHint"]]
    assert writes == ["write_ai_comment"]


def test_game_sheets_of_a_day_are_mine_only(
    token_client: TestClient, current_user, factories
) -> None:
    mine = factories.GameFactory(user=current_user, recorded_at=date(2026, 2, 10))
    factories.GameFactory(recorded_at=date(2026, 2, 10))

    result = _call(token_client, "list_game_sheets", {"recorded_on": "2026-02-10"})

    assert result["isError"] is False
    assert '"id": ' + str(mine.id) in result["content"][0]["text"]
    assert result["content"][0]["text"].count('"recorded_at": "2026-02-10"') == 1


@pytest.mark.parametrize(
    ("name", "arguments"),
    [
        ("get_profile", {}),
        ("list_game_sheets", {"until": "2026-12-31", "limit": 30}),
        ("get_game_sheet", {"game_id": "GAME"}),
        ("list_games", {"year": 2026}),
        ("list_game_years", {}),
        ("list_game_scores", {"year": 2026}),
        ("get_score_statistics", {"target": "points", "start": "2026-01-01", "end": "2026-12-31"}),
        ("list_diaries", {"limit": 10}),
    ],
)
def test_every_read_tool_works_with_a_token(
    token_client: TestClient, current_user, factories, name: str, arguments: dict
) -> None:
    game = factories.PointFactory(end__round__game__user=current_user).end.round.game
    arguments = {key: game.id if value == "GAME" else value for key, value in arguments.items()}

    result = _call(token_client, name, arguments)

    assert result["isError"] is False, result


def test_write_ai_comment_shows_it_on_the_sheet(
    token_client: TestClient, current_user, factories
) -> None:
    game = factories.GameFactory(user=current_user)

    written = _call(
        token_client,
        "write_ai_comment",
        {"game_id": game.id, "body": "【指摘】\n・右に寄る"},
    )
    sheet = token_client.get(f"/api/v1/games/{game.id}/sheet").json()

    assert written["isError"] is False
    assert sheet["ai_comment"]["body"] == "【指摘】\n・右に寄る"
    assert sheet["ai_comment"]["author"] == "Claude Code"


@pytest.mark.parametrize(
    ("name", "arguments", "expected"),
    [
        ("get_game_sheet", {"game_id": "OTHER"}, "HTTP 403"),
        ("get_game_sheet", {"game_id": "1"}, "game_id には整数を渡す"),
        ("get_game_sheet", {"game_id": True}, "game_id には整数を渡す"),
        ("get_score_statistics", {"target": "games"}, "target は"),
        ("write_ai_comment", {"game_id": "OTHER", "body": "x"}, "HTTP 403"),
        (
            "write_ai_comment",
            {"game_id": "MINE", "body": "x" * (MAX_AI_COMMENT_LENGTH + 1)},
            "HTTP 422",
        ),
        ("write_ai_comment", {"game_id": "MINE"}, "HTTP 422"),
    ],
)
def test_tool_failures_come_back_as_tool_errors(
    token_client: TestClient,
    current_user,
    factories,
    name: str,
    arguments: dict,
    expected: str,
) -> None:
    """AI が読んで直せるよう、ツールの失敗は JSON-RPC のエラーでなく isError の結果で返す。"""
    ids = {
        "OTHER": factories.GameFactory().id,
        "MINE": factories.GameFactory(user=current_user).id,
    }
    arguments = {key: ids.get(value, value) for key, value in arguments.items()}  # type: ignore[arg-type]

    result = _call(token_client, name, arguments)

    assert result["isError"] is True
    assert expected in result["content"][0]["text"]


def test_arguments_must_be_an_object(token_client: TestClient) -> None:
    result = _rpc(token_client, "tools/call", {"name": "get_profile", "arguments": [1]})["result"]

    assert result["isError"] is True


@pytest.mark.parametrize(
    ("method", "params", "code"),
    [
        ("tools/call", {"name": "delete_everything"}, mcp.INVALID_PARAMS),
        ("resources/list", None, mcp.METHOD_NOT_FOUND),
    ],
)
def test_unknown_tools_and_methods_are_rpc_errors(
    token_client: TestClient, method: str, params: dict | None, code: int
) -> None:
    assert _rpc(token_client, method, params)["error"]["code"] == code


def test_params_must_be_an_object(token_client: TestClient) -> None:
    response = token_client.post(
        URL,
        json={"jsonrpc": "2.0", "id": 1, "method": "ping", "params": [1]},
    )

    assert response.json()["error"]["code"] == mcp.INVALID_PARAMS


@pytest.mark.parametrize(
    "message",
    [
        {"id": 1, "method": "ping"},
        [{"jsonrpc": "2.0", "id": 1, "method": "ping"}],
    ],
)
def test_a_message_that_is_not_one_json_rpc_request_is_invalid(
    token_client: TestClient, message: object
) -> None:
    response = token_client.post(URL, json=message)

    assert response.json()["error"]["code"] == mcp.INVALID_REQUEST


def test_a_body_that_is_not_json_is_a_parse_error(token_client: TestClient) -> None:
    response = token_client.post(URL, content=b"{", headers={"content-type": "application/json"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == mcp.PARSE_ERROR


def test_mcp_needs_a_token_even_when_signed_in(client: TestClient) -> None:
    response = client.post(URL, json={"jsonrpc": "2.0", "id": 1, "method": "ping"})

    assert response.status_code == 401


def test_there_is_no_event_stream(token_client: TestClient) -> None:
    assert token_client.get(URL).status_code == 405


def test_call_asgi_reads_a_body_that_is_not_json(
    token_client: TestClient, access_token: str
) -> None:
    headers = {ACCESS_TOKEN_HEADER: access_token}

    guide = asyncio.run(
        mcp.call_asgi(app, mcp.ApiRequest("GET", "/guide"), headers, "/api/v1")
    )

    assert guide.status == 200
    assert isinstance(guide.data, str)
    assert guide.data.startswith("# archieves API")


def test_tools_pass_the_token_and_the_api_key_on(
    token_client: TestClient, access_token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """本番は合言葉の無い要求を API が断るので、呼び直す REST にも同じ合言葉を付ける。"""
    sent: list[dict[str, str]] = []
    call_asgi = mcp.call_asgi

    async def _spy(app_, request, headers, prefix):
        sent.append(headers)
        return await call_asgi(app_, request, headers, prefix)

    monkeypatch.setattr(mcp, "call_asgi", _spy)

    response = token_client.post(
        URL,
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_profile"}},
        headers={API_KEY_HEADER: "web-key"},
    )

    assert response.json()["result"]["isError"] is False
    assert sent == [{ACCESS_TOKEN_HEADER: access_token, API_KEY_HEADER: "web-key"}]
