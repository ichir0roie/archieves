from collections.abc import Callable
from typing import TypeVar

from fastapi import HTTPException

from app.core.security import Claims, get_current_user
from app.db.session import get_session

__all__ = ["Claims", "get_current_user", "get_or_404", "get_session"]

T = TypeVar("T")


def get_or_404(getter: Callable[..., T | None], *args: object, detail: str) -> T:
    """Call a CRUD getter and 404 if it returns None.

    Collapses the `obj = crud.get_x(...); if obj is None: raise
    HTTPException(404, ...)` pattern repeated across every endpoint that
    looks up a resource by id.
    """
    obj = getter(*args)
    if obj is None:
        raise HTTPException(status_code=404, detail=detail)
    return obj
