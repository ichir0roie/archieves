from fastapi import APIRouter, Depends

from app.api import deps
from app.api.v1.endpoints import (
    comments,
    exports,
    games,
    health,
    imports,
    organizations,
    statistics,
    support,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])

# find-or-create runs before the client holds a verified session (it is what
# establishes the account row for a sub), so it stays outside the
# authenticated router even though the rest of /users requires a token.
api_router.include_router(users.public_router, prefix="/users", tags=["users"])

# ここから下は、確かめた利用者(AUTH_MODE ごとの get_current_user。app/core/security.py)が要る。
# mock でも Authorization ヘッダーは求めるので、本物と同じ形の要求で試せる
authenticated_router = APIRouter(dependencies=[Depends(deps.get_current_user)])

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
api_router.include_router(authenticated_router)
