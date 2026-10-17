from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api import deps
from app.main import app


def test_health_does_not_require_auth() -> None:
    with TestClient(app) as unauthenticated_client:
        response = unauthenticated_client.get("/api/v1/health")
    assert response.status_code == 200


def test_users_endpoint_requires_auth(s: Session) -> None:
    def _get_session_override():
        yield s

    app.dependency_overrides[deps.get_session] = _get_session_override
    try:
        with TestClient(app) as unauthenticated_client:
            response = unauthenticated_client.get("/api/v1/users/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401


def test_users_endpoint_rejects_invalid_token(s: Session) -> None:
    def _get_session_override():
        yield s

    app.dependency_overrides[deps.get_session] = _get_session_override
    try:
        with TestClient(app) as unauthenticated_client:
            response = unauthenticated_client.get(
                "/api/v1/users/me", headers={"Authorization": "Bearer not-a-real-token"}
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401
