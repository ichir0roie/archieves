from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

WARM_UP_URL = "/api/v1/warm-up"


def test_warming_up_queries_the_db(client: TestClient, s: Session) -> None:
    statements: list[str] = []

    def _record(conn, cursor, statement: str, *_: object) -> None:
        statements.append(statement)

    connection = s.connection()
    event.listen(connection, "before_cursor_execute", _record)
    try:
        response = client.get(WARM_UP_URL)
    finally:
        event.remove(connection, "before_cursor_execute", _record)

    assert response.status_code == 204
    assert response.content == b""
    # db の接続まで温めるのが狙いなので、db に問い合わせていること
    assert len(statements) == 1, statements
    assert statements[0].lstrip().upper().startswith("SELECT 1")


def test_an_unregistered_user_can_warm_up(unregistered_client: TestClient) -> None:
    # 登録の画面(本人の行がまだ無い)からも叩くので、本人の行は求めない
    assert unregistered_client.get(WARM_UP_URL).status_code == 204


def test_warming_up_needs_a_login(anonymous_client: TestClient) -> None:
    assert anonymous_client.get(WARM_UP_URL).status_code == 401


def test_a_token_cannot_warm_up(token_client: TestClient) -> None:
    assert token_client.get(WARM_UP_URL).status_code == 403
