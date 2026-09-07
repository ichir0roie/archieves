from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api import deps
from app.main import app


def test_health_does_not_require_auth() -> None:
    with TestClient(app) as unauthenticated_client:
        response = unauthenticated_client.get("/api/v1/health")
    assert response.status_code == 200


def test_users_endpoint_requires_auth(db_session: Session) -> None:
    def _get_db_override():
        yield db_session

    app.dependency_overrides[deps.get_session] = _get_db_override
    try:
        with TestClient(app) as unauthenticated_client:
            response = unauthenticated_client.get("/api/v1/users")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_users_endpoint_rejects_invalid_token(db_session: Session) -> None:
    def _get_db_override():
        yield db_session

    app.dependency_overrides[deps.get_session] = _get_db_override
    try:
        with TestClient(app) as unauthenticated_client:
            response = unauthenticated_client.get(
                "/api/v1/users", headers={"Authorization": "Bearer not-a-real-token"}
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401
