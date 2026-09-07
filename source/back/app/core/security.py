"""Cognito JWT verification.

Same approach as all_diary_backend's module/api/auth/auth.py: verify a
bearer token against the user pool's JWKS, then expose the token claims via
a FastAPI dependency. The JWKS fetch is lazy and cached instead of running
at import time, so the app can still start (and tests can override
get_current_user) without Cognito configured.
"""

import json
import time
import urllib.request
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwk, jwt
from jose.utils import base64url_decode
from pydantic import BaseModel

from app.core.config import debug_settings, settings

bearer_scheme = HTTPBearer()


class Claims(BaseModel):
    sub: str
    username: str | None = None
    email: str | None = None
    scope: str | None = None


@lru_cache
def _get_jwks() -> list[dict]:
    keys_url = (
        f"https://cognito-idp.{settings.AWS_REGION}.amazonaws.com/"
        f"{settings.USERPOOL_ID}/.well-known/jwks.json"
    )
    with urllib.request.urlopen(keys_url) as response:
        body = response.read()
    return json.loads(body.decode("utf-8"))["keys"]


def verify_token(token: str) -> dict:
    """Verify a Cognito-issued JWT and return its claims.

    https://github.com/awslabs/aws-support-tools/blob/master/Cognito/decode-verify-jwt/decode-verify-jwt.py
    """
    headers = jwt.get_unverified_headers(token)
    kid = headers["kid"]

    key = next((k for k in _get_jwks() if k["kid"] == kid), None)
    if key is None:
        raise ValueError("Public key not found in jwks.json")
    public_key = jwk.construct(key)

    message, encoded_signature = token.rsplit(".", 1)
    decoded_signature = base64url_decode(encoded_signature.encode("utf-8"))
    if not public_key.verify(message.encode("utf-8"), decoded_signature):
        raise ValueError("Signature verification failed")

    claims = jwt.get_unverified_claims(token)
    if time.time() > claims["exp"]:
        raise ValueError("Token is expired")

    claims_client_id = claims.get("client_id", claims.get("aud"))
    if claims_client_id != settings.APP_CLIENT_ID:
        raise ValueError("Token was not issued for this audience")

    return claims


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> Claims:
    # Local/debug escape hatch (see DebugSettings.AUTH_MODE): skips the
    # Cognito JWKS round-trip entirely, so the API needs no AWS access to
    # run. The bearer scheme dependency above still requires *an*
    # Authorization header, matching the shape of a real request; its value
    # is ignored.
    if debug_settings.AUTH_MODE == "mock":
        return Claims(
            sub=debug_settings.MOCK_USER_SUB,
            username=debug_settings.MOCK_USER_USERNAME,
            email=debug_settings.MOCK_USER_EMAIL,
        )

    try:
        claims = verify_token(credentials.credentials)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    return Claims.model_validate(claims)
