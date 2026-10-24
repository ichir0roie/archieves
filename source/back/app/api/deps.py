"""エンドポイントの依存。だれに通すかは、エンドポイントごとに次のどれかで決める。

- get_me: 画面からログインした本人。書き込み・設定・トークンの発行など
- get_reader: get_me に加え、本人が発行したトークン(Claude Code など)。本人の記録を読む GET だけ
- get_ai_commenter: 本人が発行したトークンだけ。AI コメントを書く口
- get_diary_importer: 本人が発行したトークンだけ。日記を取り込む口
- require_access_token: 本人が発行したトークンだけ。MCP の口
  (中で REST を呼び直し、そちらが改めて確かめる)
- get_admin: 画面からログインした管理者
- get_browser_claims: 画面からのログイン(利用者の行が無くてもよいもの)
- get_optional_me: ログインしていなくても通す /public。トークンでは通さない
"""

import logging
from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.errors import (
    ACCESS_TOKEN_NOT_ALLOWED,
    AI_COMMENT_NEEDS_ACCESS_TOKEN,
    CURRENT_USER_NOT_REGISTERED,
    DIARY_IMPORT_NEEDS_ACCESS_TOKEN,
    ForbiddenError,
    NotFoundError,
)
from app.core.security import Claims, access_token_scheme, get_optional_current_user
from app.core.visibility import can_view_profile
from app.crud import access_token as access_token_crud
from app.crud import user as user_crud
from app.db import AccessToken, User
from app.db.session import get_session

__all__ = [
    "Claims",
    "authenticate",
    "get_access_token",
    "get_admin",
    "get_ai_commenter",
    "get_browser_claims",
    "get_diary_importer",
    "get_me",
    "get_optional_current_user",
    "get_optional_me",
    "get_or_404",
    "get_own_or_404",
    "get_reader",
    "get_session",
    "get_token_user",
    "require_access_token",
    "require_profile_visible",
    "require_self",
]

logger = logging.getLogger(__name__)

# トークンで通す要求のメソッド。トークンは読むだけ
READ_METHODS = {"GET", "HEAD"}


def _unauthenticated(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


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


def get_access_token(
    token: str | None = Depends(access_token_scheme),
    s: Session = Depends(get_session),
) -> tuple[AccessToken, User] | None:
    """利用者が発行したトークンで来たなら、その行と持ち主。トークンが無ければ None。

    無い・期限の切れたトークンは 401 にする(ログインしていない扱いにしない)。
    """
    if token is None:
        return None
    found = access_token_crud.get_access_token_owner(s, token)
    if found is None:
        raise _unauthenticated("Invalid access token")
    access_token, user = found
    # 漏れたトークンが使われていないかを後から追えるよう、どのトークンで来たかを残す
    logger.info(f"access token {access_token.id} of user {user.id}")
    return found


def get_token_user(
    found: tuple[AccessToken, User] | None = Depends(get_access_token),
) -> User | None:
    """利用者が発行したトークンで来たなら、その持ち主。トークンが無ければ None。"""
    return None if found is None else found[1]


def require_access_token(
    found: tuple[AccessToken, User] | None = Depends(get_access_token),
) -> tuple[AccessToken, User]:
    """本人が発行したトークンで来た要求だけを通す(MCP)。画面からのログインだけなら 401。"""
    if found is None:
        raise _unauthenticated("Access token required")
    return found


def get_ai_commenter(
    found: tuple[AccessToken, User] | None = Depends(get_access_token),
) -> tuple[AccessToken, User]:
    """AI コメントを書く、トークンとその持ち主。トークンで書く口なので、画面からのログインは 403。

    トークンで書けるのは、ここと get_diary_importer(日記の取り込み)だけ。
    """
    if found is None:
        raise ForbiddenError(AI_COMMENT_NEEDS_ACCESS_TOKEN)
    return found


def get_diary_importer(
    found: tuple[AccessToken, User] | None = Depends(get_access_token),
) -> User:
    """日記を取り込む、トークンの持ち主。AI が別の所の日記を移す口なので、ログインは 403。"""
    if found is None:
        raise ForbiddenError(DIARY_IMPORT_NEEDS_ACCESS_TOKEN)
    return found[1]


def authenticate(
    token_user: User | None = Depends(get_token_user),
    claims: Claims | None = Depends(get_optional_current_user),
) -> None:
    """ログインの要るエンドポイントの入り口(api.py の authenticated_router)。

    画面からのログインかトークンのどちらかを求めるだけで、どちらを通すかはエンドポイントごとの依存が決める。
    """
    if token_user is None and claims is None:
        raise _unauthenticated("Not authenticated")


def get_browser_claims(
    token: str | None = Depends(access_token_scheme),
    claims: Claims | None = Depends(get_optional_current_user),
) -> Claims:
    """画面からログインした利用者。トークンで来たら 403 にする。"""
    if token is not None:
        raise ForbiddenError(ACCESS_TOKEN_NOT_ALLOWED)
    if claims is None:
        raise _unauthenticated("Not authenticated")
    return claims


def _registered_user(s: Session, claims: Claims) -> User:
    user = user_crud.get_user_by_sub(s, claims.sub)
    if user is None:
        raise NotFoundError(CURRENT_USER_NOT_REGISTERED)
    return user


def get_me(
    claims: Claims = Depends(get_browser_claims),
    s: Session = Depends(get_session),
) -> User:
    """画面からログインした本人(Cognito の sub)の行。トークンでは通さない。"""
    return _registered_user(s, claims)


def get_reader(
    request: Request,
    token_user: User | None = Depends(get_token_user),
    claims: Claims | None = Depends(get_optional_current_user),
    s: Session = Depends(get_session),
) -> User:
    """本人の記録を読むエンドポイントの本人。画面からのログインのほか、本人が発行したトークンでも通す。

    トークンの持ち主が本人になるので、トークンで読めるのはその人の記録だけ。
    GET のエンドポイントにだけ付ける。
    """
    if token_user is not None:
        # GET 以外に付け間違えても、トークンでは書かせない
        if request.method not in READ_METHODS:
            raise ForbiddenError(ACCESS_TOKEN_NOT_ALLOWED)
        return token_user
    if claims is None:
        raise _unauthenticated("Not authenticated")
    return _registered_user(s, claims)


def get_optional_me(
    token: str | None = Depends(access_token_scheme),
    claims: Claims | None = Depends(get_optional_current_user),
    s: Session = Depends(get_session),
) -> User | None:
    """ログインしていなくても通すエンドポイントの、見る人の行。

    ログインしていない、または利用者の行がまだ無いなら None(ログインしていない人と同じに扱う)。
    トークンは本人の記録だけを読ませるので、他人の公開分も読ませない(403)。
    """
    if token is not None:
        raise ForbiddenError(ACCESS_TOKEN_NOT_ALLOWED)
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


def require_profile_visible(viewer: User | None, user: User) -> None:
    """見る人(ログインしていなければ None)にプロフィールを公開していない利用者なら 403 にする。"""
    if not can_view_profile(viewer, user):
        raise ForbiddenError("This profile is private")


def get_own_or_404[T](me: User, getter: Callable[..., T | None], *args: object, detail: str) -> T:
    """`get_or_404` に加え、行の持ち主が本人であることを確かめる(`user_id` を持つ行用)。"""
    obj = get_or_404(getter, *args, detail=detail)
    require_self(me, obj.user_id)  # type: ignore[attr-defined]
    return obj
