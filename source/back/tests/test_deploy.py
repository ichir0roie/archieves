"""本番(Lambda)に出す部品: IAM データベース認証・マイグレーションの Lambda・proxy の起動条件。"""

import sys
import types

import pytest
from fastapi.testclient import TestClient

from app.core.config import debug_settings, settings
from app.db import session as db_session
from app.migration_app import app as migration_app


class _FakeRds:
    def generate_db_auth_token(self, **kwargs: object) -> str:
        return "token-for-{DBHostname}:{Port}/{DBUsername}".format(**kwargs)


@pytest.fixture()
def fake_boto3(monkeypatch: pytest.MonkeyPatch) -> None:
    module = types.ModuleType("boto3")
    module.client = lambda service, region_name: _FakeRds()  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "boto3", module)


def test_iam_auth_token_is_signed_for_the_given_user(fake_boto3: None) -> None:
    assert db_session.iam_auth_token("db.example", 5432, "archieves_app") == (
        "token-for-db.example:5432/archieves_app"
    )


def test_inject_iam_token_replaces_the_password_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
    fake_boto3: None,
) -> None:
    monkeypatch.setattr(settings, "DB_IAM_AUTH", True)
    cparams: dict[str, object] = {"host": "db.example", "port": "5432", "user": "archieves_app"}

    db_session.inject_iam_token(None, None, (), cparams)

    assert cparams["password"] == "token-for-db.example:5432/archieves_app"
    assert cparams["sslmode"] == "require"


def test_inject_iam_token_leaves_the_password_alone_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "DB_IAM_AUTH", False)
    cparams: dict[str, object] = {"host": "localhost", "port": 5432, "user": "u", "password": "p"}

    db_session.inject_iam_token(None, None, (), cparams)

    assert cparams == {"host": "localhost", "port": 5432, "user": "u", "password": "p"}


def test_migration_lambda_upgrades_to_head() -> None:
    client = TestClient(migration_app)

    assert client.get("/api/v1/health").json() == {"ok": True}
    body = client.post("/events").json()

    assert body["head"] is not None
    assert body["after"] == body["head"]


def test_proxy_mode_refuses_to_start_without_api_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    import importlib

    import app.main as main

    monkeypatch.setattr(debug_settings, "AUTH_MODE", "proxy")
    monkeypatch.setattr(settings, "API_KEYS", "")
    try:
        with pytest.raises(RuntimeError, match="API_KEYS"):
            importlib.reload(main)
    finally:
        monkeypatch.undo()
        importlib.reload(main)
