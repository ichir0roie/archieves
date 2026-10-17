from fastapi import APIRouter, Depends

from app.api import deps
from app.api.v1.endpoints import (
    access_tokens,
    comments,
    diaries,
    exports,
    games,
    guide,
    health,
    imports,
    organizations,
    public,
    statistics,
    support,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(guide.router, tags=["guide"])

# ログインしていなくても読める。見る人の公開範囲に入る分だけを返す(endpoints/public.py)
api_router.include_router(public.router, prefix="/public", tags=["public"])

# ここから下は、画面からのログイン(AUTH_MODE ごとの get_current_user。app/core/security.py)か、
# 本人が発行したトークンが要る。どちらを通すかは、エンドポイントごとの依存
# (app/api/deps.py)が決める。
# mock でも Authorization ヘッダーは求めるので、本物と同じ形の要求で試せる
authenticated_router = APIRouter(dependencies=[Depends(deps.authenticate)])

authenticated_router.include_router(users.router, prefix="/users", tags=["users"])
authenticated_router.include_router(
    organizations.router, prefix="/organizations", tags=["organizations"]
)
authenticated_router.include_router(games.router, tags=["games"])
authenticated_router.include_router(comments.router, tags=["comments"])
authenticated_router.include_router(imports.router, tags=["imports"])
authenticated_router.include_router(exports.router, tags=["exports"])
authenticated_router.include_router(
    statistics.router, prefix="/statistics", tags=["statistics"]
)
authenticated_router.include_router(support.router, tags=["support"])
authenticated_router.include_router(diaries.router, tags=["diaries"])
authenticated_router.include_router(access_tokens.router, tags=["access-tokens"])
api_router.include_router(authenticated_router)
