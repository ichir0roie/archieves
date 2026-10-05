"""API の合言葉(x-archieves-api-key)。

ブラウザは API を直に叩かず、フロントの Next.js のサーバー(source/front/src/app/api/v1)が
合言葉を付けて流す。合言葉の無い要求を断ることで、公開の URL に置いた API を
フロントのサーバーからしか使えないようにする。利用者が誰かは、これとは別に
Cognito の ID トークン(app/core/security.py)で確かめる。
"""

import hmac
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

API_KEY_HEADER = "x-archieves-api-key"
# 合言葉なしで通すパス。Lambda Web Adapter の起動確認と、外からの死活監視が叩く
PUBLIC_PATHS = {"/api/v1/health"}


def parse_api_keys(raw: str) -> dict[str, str]:
    """`名前=鍵` をカンマで区切ったもの(例: web=…,admin=…)を {名前: 鍵} にする。

    呼ぶ側ごとに分けるのは、一つの鍵が漏れたときに、ほかの鍵を止めずに替えられるようにするため。
    """
    keys: dict[str, str] = {}
    for entry in filter(None, (entry.strip() for entry in raw.split(","))):
        name, _, key = (part.strip() for part in entry.partition("="))
        if not name or not key:
            raise ValueError("API_KEYS は `名前=鍵` をカンマで区切って書く")
        keys[name] = key
    return keys


def install_api_key_check(app: FastAPI, keys: dict[str, str]) -> None:
    """keys が空なら何もしない(手元・テストでは合言葉を確かめない)。"""
    if not keys:
        return

    @app.middleware("http")
    async def _require_api_key(request: Request, call_next):
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)
        given = request.headers.get(API_KEY_HEADER, "").encode()
        caller = next(
            (name for name, key in keys.items() if hmac.compare_digest(given, key.encode())),
            None,
        )
        if caller is None:
            return JSONResponse(
                status_code=401,
                content={"detail": f"{API_KEY_HEADER} が無いか違う"},
            )
        # おかしな書き込みがあったときに、どの鍵で来たかを切り分けられるよう、鍵の名前だけを出す
        logger.info(f"{caller}: {request.method} {request.url.path}")
        return await call_next(request)
