import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.errors import NotFoundError, install_exception_handlers


class _Strict(BaseModel):
    n: int


@pytest.fixture()
def error_client() -> TestClient:
    app = FastAPI()
    install_exception_handlers(app)

    @app.get("/not-found")
    def not_found() -> None:
        raise NotFoundError("Thing not found")

    @app.get("/invalid")
    def invalid() -> None:
        raise ValueError("bad value")

    @app.get("/broken")
    def broken() -> None:
        _Strict(n="not a number")

    return TestClient(app, raise_server_exceptions=False)


def test_not_found_error_is_404(error_client: TestClient) -> None:
    response = error_client.get("/not-found")
    assert response.status_code == 404
    assert response.json() == {"detail": "Thing not found"}


def test_value_error_is_400(error_client: TestClient) -> None:
    response = error_client.get("/invalid")
    assert response.status_code == 400
    assert response.json() == {"detail": "bad value"}


def test_pydantic_validation_error_inside_a_handler_is_500_not_400(
    error_client: TestClient,
) -> None:
    response = error_client.get("/broken")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}
