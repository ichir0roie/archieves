from collections.abc import Callable

from app.core.errors import NotFoundError
from app.core.security import Claims, get_current_user
from app.db.session import get_session

__all__ = ["Claims", "get_current_user", "get_or_404", "get_session"]


def get_or_404[T](getter: Callable[..., T | None], *args: object, detail: str) -> T:
    """Call a CRUD getter and 404 if it returns None.

    Collapses the `obj = crud.get_x(...); if obj is None: raise
    NotFoundError(...)` pattern repeated across every endpoint that
    looks up a resource by id.
    """
    obj = getter(*args)
    if obj is None:
        raise NotFoundError(detail)
    return obj
