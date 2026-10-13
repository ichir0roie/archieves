from collections.abc import Callable

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.errors import (
    CURRENT_USER_NOT_REGISTERED,
    ForbiddenError,
    NotFoundError,
)
from app.core.security import Claims, get_current_user, get_optional_current_user
from app.core.visibility import can_view_profile
from app.crud import user as user_crud
from app.db import User
from app.db.session import get_session

__all__ = [
    "Claims",
    "get_current_user",
    "get_me",
    "get_optional_current_user",
    "get_optional_me",
    "get_admin",
    "get_or_404",
    "get_own_or_404",
    "get_session",
    "require_profile_visible",
    "require_self",
    "resolve_user_id",
]


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


def get_me(
    claims: Claims = Depends(get_current_user),
    s: Session = Depends(get_session),
) -> User:
    """Amplify(Cognito)の sub に結びついた利用者の行。「本人のみ」のエンドポイントが使う。"""
    user = user_crud.get_user_by_sub(s, claims.sub)
    if user is None:
        raise NotFoundError(CURRENT_USER_NOT_REGISTERED)
    return user


def get_optional_me(
    claims: Claims | None = Depends(get_optional_current_user),
    s: Session = Depends(get_session),
) -> User | None:
    """ログインしていなくても通すエンドポイントの、見る人の行。

    ログインしていない、または利用者の行がまだ無いなら None(ログインしていない人と同じに扱う)。
    """
    if claims is None:
        return None
    return user_crud.get_user_by_sub(s, claims.sub)


def get_admin(me: User = Depends(get_me)) -> User:
    """管理者(users.is_admin)の利用者の行。「管理者のみ」のエンドポイントが使う。"""
    if not me.is_admin:
        raise ForbiddenError("Admin only")
    return me


def require_self(me: User, user_id: int) -> None:
    """行の持ち主 `user_id` が本人でなければ 403 にする。"""
    if user_id != me.id:
        raise ForbiddenError("Not allowed to access another user's data")


def require_profile_visible(me: User, user: User) -> None:
    """本人でなく、プロフィールを本人に公開していない利用者なら 403 にする。"""
    if not can_view_profile(me, user):
        raise ForbiddenError("This profile is private")


def resolve_user_id(me: User, user_id: int | None) -> int:
    """絞り込みの `user_id`。省略したら本人、本人以外が指定されたら 403。"""
    if user_id is None:
        return me.id
    require_self(me, user_id)
    return user_id


def get_own_or_404[T](me: User, getter: Callable[..., T | None], *args: object, detail: str) -> T:
    """`get_or_404` に加え、行の持ち主が本人であることを確かめる(`user_id` を持つ行用)。"""
    obj = get_or_404(getter, *args, detail=detail)
    require_self(me, obj.user_id)  # type: ignore[attr-defined]
    return obj
