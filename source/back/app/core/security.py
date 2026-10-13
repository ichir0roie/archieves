"""利用者の確かめ。AUTH_MODE(app/core/config.py)で、import した時に一つを選ぶ。

- cognito: この API が、Cognito の ID トークンを公開鍵(JWKS)で確かめる。
  手元で本物の Cognito を使うとき
- proxy: フロントのサーバー(source/front/src/app/api/v1)が確かめ、利用者を
  x-archieves-user-* で渡す。本番。
  Lambda は NAT のない VPC の中にいて JWKS を取りに行けない。合言葉(app/core/api_keys.py)を持つ
  呼び出しだけが届くので、ヘッダーをそのまま信じる
- mock: 確かめず、MOCK_USER_* の利用者として通す。手元・テスト

JWKS の取得は import 時でなく初回に行い、キャッシュする(Cognito 無しでも app を起こせる)。
"""

import json
import time
import urllib.request
from functools import lru_cache
from typing import Annotated
from urllib.parse import unquote

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwk, jwt
from jose.utils import base64url_decode
from pydantic import BaseModel

from app.core.config import debug_settings, settings

bearer_scheme = HTTPBearer()
# ログインしていなくても通すエンドポイント用。Authorization が無ければ None にする
optional_bearer_scheme = HTTPBearer(auto_error=False)

# AUTH_MODE=proxy で利用者を受けるヘッダー(値は URL エンコード)
USER_SUB_HEADER = "x-archieves-user-sub"
USER_USERNAME_HEADER = "x-archieves-user-username"
USER_EMAIL_HEADER = "x-archieves-user-email"


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
    """Cognito が発行した JWT を確かめて claims を返す。

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


def cognito_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> Claims:
    try:
        claims = verify_token(credentials.credentials)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    return Claims.model_validate(claims)


def _header(request: Request, name: str) -> str | None:
    value = request.headers.get(name)
    return unquote(value) if value else None


def proxied_user(request: Request) -> Claims:
    sub = _header(request, USER_SUB_HEADER)
    if sub is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing verified user",
        )
    return Claims(
        sub=sub,
        username=_header(request, USER_USERNAME_HEADER),
        email=_header(request, USER_EMAIL_HEADER),
    )


def mock_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> Claims:
    # 本物の要求と同じ形になるよう Authorization ヘッダーがあることだけは求め、値は見ない
    return Claims(
        sub=debug_settings.MOCK_USER_SUB,
        username=debug_settings.MOCK_USER_USERNAME,
        email=debug_settings.MOCK_USER_EMAIL,
    )


get_current_user = {
    "cognito": cognito_user,
    "proxy": proxied_user,
    "mock": mock_user,
}[debug_settings.AUTH_MODE]


# 以下は、ログインしていなくても通すエンドポイント(公開の範囲だけを返すもの)が使う。
# 利用者が分かれば Claims、ログインしていなければ None。ログインしている印があるのに確かめられない
# (トークンが壊れている・切れている)ときは、ログインしていない扱いにせず 401 にする


def optional_cognito_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(optional_bearer_scheme)],
) -> Claims | None:
    if credentials is None:
        return None
    return cognito_user(credentials)


def optional_proxied_user(request: Request) -> Claims | None:
    if _header(request, USER_SUB_HEADER) is None:
        return None
    return proxied_user(request)


def optional_mock_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(optional_bearer_scheme)],
) -> Claims | None:
    if credentials is None:
        return None
    return mock_user(credentials)


get_optional_current_user = {
    "cognito": optional_cognito_user,
    "proxy": optional_proxied_user,
    "mock": optional_mock_user,
}[debug_settings.AUTH_MODE]
