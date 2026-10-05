import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.api_keys import API_KEY_HEADER, install_api_key_check, parse_api_keys


def _app(keys: dict[str, str]) -> TestClient:
    app = FastAPI()
    install_api_key_check(app, keys)

    @app.get("/api/v1/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/v1/games")
    def games() -> list[int]:
        return []

    return TestClient(app)


def test_parse_api_keys_reads_named_keys() -> None:
    assert parse_api_keys(" web=abc , admin=def ") == {"web": "abc", "admin": "def"}


def test_parse_api_keys_of_an_empty_string_is_empty() -> None:
    assert parse_api_keys("") == {}


@pytest.mark.parametrize("raw", ["web", "=abc", "web="])
def test_parse_api_keys_rejects_an_entry_without_a_name_and_a_key(raw: str) -> None:
    with pytest.raises(ValueError):
        parse_api_keys(raw)


def test_no_keys_means_no_check() -> None:
    assert _app({}).get("/api/v1/games").status_code == 200


def test_a_request_without_the_key_is_rejected() -> None:
    response = _app({"web": "secret"}).get("/api/v1/games")
    assert response.status_code == 401
    assert API_KEY_HEADER in response.json()["detail"]


def test_a_request_with_a_wrong_key_is_rejected() -> None:
    response = _app({"web": "secret"}).get("/api/v1/games", headers={API_KEY_HEADER: "nope"})
    assert response.status_code == 401


def test_a_request_with_any_configured_key_passes() -> None:
    client = _app({"web": "secret", "admin": "other"})
    assert client.get("/api/v1/games", headers={API_KEY_HEADER: "other"}).status_code == 200


def test_health_needs_no_key() -> None:
    assert _app({"web": "secret"}).get("/api/v1/health").status_code == 200
