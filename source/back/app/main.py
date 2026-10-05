import logging

from fastapi import FastAPI

from app.api.v1.api import api_router
from app.core.api_keys import install_api_key_check, parse_api_keys
from app.core.config import settings
from app.core.errors import install_exception_handlers

# uvicorn は自分のロガーにしか出し先を付けないので、app.* の logger の出し先をここで付ける
logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# ブラウザはフロントの Next.js のサーバー越しに同じ origin で呼ぶので、CORS は要らない
install_api_key_check(app, parse_api_keys(settings.API_KEYS))
install_exception_handlers(app)
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["root"])
def read_root() -> dict[str, str]:
    return {"name": settings.PROJECT_NAME, "docs": "/docs"}
