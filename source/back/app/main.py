import logging

from fastapi import FastAPI

from app.api.v1.api import api_router
from app.core.api_keys import install_api_key_check, parse_api_keys
from app.core.config import debug_settings, settings
from app.core.errors import install_exception_handlers

# uvicorn は自分のロガーにしか出し先を付けないので、app.* の logger の出し先をここで付ける
logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")

# デプロイした環境(infra/lib/config.ts の stageConfig の stage)。手元・テストは local
DEPLOYED_ENVS = {"prod", "dev"}

api_keys = parse_api_keys(settings.API_KEYS)
# proxy は合言葉を持つ呼び出しの言う利用者をそのまま信じるので、合言葉なしでは起こさない
if debug_settings.AUTH_MODE == "proxy" and not api_keys:
    raise RuntimeError("AUTH_MODE=proxy には API_KEYS が要る")
# mock は確かめずにだれでも通すので、デプロイした環境では起こさない
if debug_settings.AUTH_MODE == "mock" and settings.ENV in DEPLOYED_ENVS:
    raise RuntimeError(f"ENV={settings.ENV} では AUTH_MODE=mock を使わない")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Claude などの AI は、まず `GET /api/v1/guide` で使い方を読む。",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# ブラウザはフロントの Next.js のサーバー越しに同じ origin で呼ぶので、CORS は要らない
install_api_key_check(app, api_keys)
install_exception_handlers(app)
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["root"])
def read_root() -> dict[str, str]:
    return {"name": settings.PROJECT_NAME, "docs": "/docs"}
