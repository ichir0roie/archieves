from fastapi import APIRouter, Depends

from app.api import deps
from app.api.v1.endpoints import (
    comments,
    games,
    health,
    imports,
    organizations,
    statistics,
    users,
)

from app.core.config import debug_settings
api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])

# find-or-create runs before the client holds a verified session (it is what
# establishes the account row for a sub), so it stays outside the
# authenticated router even though the rest of /users requires a token.
api_router.include_router(users.public_router, prefix="/users", tags=["users"])

# Everything below requires a verified Cognito bearer token, mirroring
# all_diary_backend's auth_router.
authenticated_router = APIRouter()

if debug_settings.AUTH_MODE == "cognito":
    authenticated_router.dependencies.append(Depends(deps.get_current_user))

authenticated_router.include_router(users.router, prefix="/users", tags=["users"])
authenticated_router.include_router(
    organizations.router, prefix="/organizations", tags=["organizations"]
)
authenticated_router.include_router(games.router, tags=["games"])
authenticated_router.include_router(comments.router, tags=["comments"])
authenticated_router.include_router(imports.router, tags=["imports"])
authenticated_router.include_router(
    statistics.router, prefix="/statistics", tags=["statistics"]
)
api_router.include_router(authenticated_router)
