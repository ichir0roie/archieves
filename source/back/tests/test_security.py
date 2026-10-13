import json
import time
from contextlib import contextmanager

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from starlette.requests import Request

from app.core import security
from app.core.config import debug_settings, settings

KID = "test-key-id"
CLIENT_ID = "test-app-client-id"


@pytest.fixture(scope="module")
def private_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


@pytest.fixture(scope="module")
def jwks(private_pem: str) -> list[dict]:
    from jose.backends import RSAKey
    from jose.constants import ALGORITHMS

    assert RSAKey is not None
    public_jwk = RSAKey(private_pem, ALGORITHMS.RS256).public_key().to_dict()
    return [{**public_jwk, "kid": KID}]


@pytest.fixture()
def cognito_auth(
    monkeypatch: pytest.MonkeyPatch,
    jwks: list[dict],
) -> None:
    monkeypatch.setattr(security, "_get_jwks", lambda: jwks)
    monkeypatch.setattr(settings, "APP_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(debug_settings, "AUTH_MODE", "cognito")


def _make_token(private_pem: str, **claims: object) -> str:
    from jose import jwt

    payload = {
        "sub": "cognito-user-sub",
        "username": "yumi",
        "email": "yumi@example.com",
        "exp": int(time.time()) + 3600,
        "client_id": CLIENT_ID,
    }
    payload.update(claims)
    payload = {k: v for k, v in payload.items() if v is not None}
    return jwt.encode(
        payload,
        private_pem,
        algorithm="RS256",
        headers={"kid": KID},
    )


def _credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _request(**headers: str) -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(k.replace("_", "-").encode(), v.encode()) for k, v in headers.items()],
        }
    )


def test_verify_token_returns_claims_for_a_valid_token(
    cognito_auth: None,
    private_pem: str,
) -> None:
    claims = security.verify_token(_make_token(private_pem))

    assert claims["sub"] == "cognito-user-sub"
    assert claims["email"] == "yumi@example.com"


def test_verify_token_accepts_aud_when_client_id_is_absent(
    cognito_auth: None,
    private_pem: str,
) -> None:
    token = _make_token(private_pem, client_id=None, aud=CLIENT_ID)

    claims = security.verify_token(token)

    assert claims["aud"] == CLIENT_ID


def test_verify_token_rejects_an_unknown_kid(
    monkeypatch: pytest.MonkeyPatch,
    cognito_auth: None,
    private_pem: str,
) -> None:
    monkeypatch.setattr(security, "_get_jwks", list)

    with pytest.raises(ValueError, match="Public key not found"):
        security.verify_token(_make_token(private_pem))


def test_verify_token_rejects_a_tampered_signature(
    cognito_auth: None,
    private_pem: str,
) -> None:
    message, signature = _make_token(private_pem).rsplit(".", 1)
    tampered = f"{message}.{'A' * len(signature)}"

    with pytest.raises(ValueError, match="Signature verification failed"):
        security.verify_token(tampered)


def test_verify_token_rejects_an_expired_token(
    cognito_auth: None,
    private_pem: str,
) -> None:
    expired = _make_token(private_pem, exp=int(time.time()) - 1)

    with pytest.raises(ValueError, match="Token is expired"):
        security.verify_token(expired)


def test_verify_token_rejects_a_token_issued_for_another_audience(
    cognito_auth: None,
    private_pem: str,
) -> None:
    other = _make_token(private_pem, client_id="some-other-client")

    with pytest.raises(ValueError, match="not issued for this audience"):
        security.verify_token(other)


def test_get_current_user_returns_claims_for_a_valid_token(
    cognito_auth: None,
    private_pem: str,
) -> None:
    claims = security.cognito_user(_credentials(_make_token(private_pem)))

    assert claims.sub == "cognito-user-sub"
    assert claims.username == "yumi"
    assert claims.email == "yumi@example.com"


def test_get_current_user_raises_401_for_an_invalid_token(cognito_auth: None) -> None:
    with pytest.raises(HTTPException) as exc_info:
        security.cognito_user(_credentials("not-a-jwt"))

    assert exc_info.value.status_code == 401
    assert exc_info.value.headers == {"WWW-Authenticate": "Bearer"}


def test_mock_user_returns_the_configured_claims(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(debug_settings, "MOCK_USER_SUB", "mock-sub")
    monkeypatch.setattr(debug_settings, "MOCK_USER_USERNAME", "mock-user")
    monkeypatch.setattr(debug_settings, "MOCK_USER_EMAIL", "mock@example.com")

    claims = security.mock_user(_credentials("ignored"))

    assert claims.sub == "mock-sub"
    assert claims.username == "mock-user"
    assert claims.email == "mock@example.com"


def test_proxied_user_reads_the_verified_user_from_headers() -> None:
    request = _request(
        x_archieves_user_sub="proxy-sub",
        x_archieves_user_username="proxy%20user",
        x_archieves_user_email="proxy%40example.com",
    )

    claims = security.proxied_user(request)

    assert claims.sub == "proxy-sub"
    assert claims.username == "proxy user"
    assert claims.email == "proxy@example.com"


def test_proxied_user_raises_401_without_a_user() -> None:
    with pytest.raises(HTTPException) as exc_info:
        security.proxied_user(_request())

    assert exc_info.value.status_code == 401


def test_get_current_user_is_chosen_by_auth_mode() -> None:
    # conftest が AUTH_MODE=cognito にしてから import している
    assert security.get_current_user is security.cognito_user
    assert security.get_optional_current_user is security.optional_cognito_user


def test_optional_users_are_none_without_a_sign_in() -> None:
    assert security.optional_cognito_user(None) is None
    assert security.optional_mock_user(None) is None
    assert security.optional_proxied_user(_request()) is None


def test_optional_cognito_user_returns_claims_for_a_valid_token(
    cognito_auth: None,
    private_pem: str,
) -> None:
    claims = security.optional_cognito_user(_credentials(_make_token(private_pem)))

    assert claims is not None
    assert claims.sub == "cognito-user-sub"


def test_optional_cognito_user_raises_401_for_an_invalid_token(cognito_auth: None) -> None:
    # トークンを送ってきたのに確かめられないときは、ログインしていない扱いにしない
    with pytest.raises(HTTPException) as exc_info:
        security.optional_cognito_user(_credentials("not-a-jwt"))

    assert exc_info.value.status_code == 401


def test_optional_mock_and_proxied_users_return_the_signed_in_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(debug_settings, "MOCK_USER_SUB", "mock-sub")

    mock_claims = security.optional_mock_user(_credentials("ignored"))
    proxied_claims = security.optional_proxied_user(_request(x_archieves_user_sub="proxy-sub"))

    assert mock_claims is not None
    assert mock_claims.sub == "mock-sub"
    assert proxied_claims is not None
    assert proxied_claims.sub == "proxy-sub"


def test_get_jwks_fetches_the_userpool_keys_once(
    monkeypatch: pytest.MonkeyPatch,
    jwks: list[dict],
) -> None:
    requested: list[str] = []

    @contextmanager
    def _fake_urlopen(url: str):
        requested.append(url)
        yield _FakeResponse(json.dumps({"keys": jwks}).encode("utf-8"))

    monkeypatch.setattr(settings, "USERPOOL_ID", "ap-northeast-1_testpool")
    monkeypatch.setattr(security.urllib.request, "urlopen", _fake_urlopen)
    security._get_jwks.cache_clear()
    try:
        assert security._get_jwks() == jwks
        assert security._get_jwks() == jwks
    finally:
        security._get_jwks.cache_clear()

    assert len(requested) == 1
    assert requested[0].endswith("/ap-northeast-1_testpool/.well-known/jwks.json")


class _FakeResponse:
    def __init__(self, body: bytes) -> None:
        self._body = body

    def read(self) -> bytes:
        return self._body
