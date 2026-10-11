from sqlalchemy import ColumnElement, and_, false, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.visibility import Visibility
from app.db import User
from app.schemas.user import UserCreate, UserUpdate


def get_user(s: Session, user_id: int) -> User | None:
    return s.get(User, user_id)


def get_user_by_sub(s: Session, sub: str) -> User | None:
    return s.scalar(select(User).where(User.sub == sub))


def visible_condition(viewer: User, visibility: ColumnElement[str]) -> ColumnElement[bool]:
    """core/visibility.py の is_visible() を SQL で書いたもの。

    User を引く select の where に使う。
    """
    if viewer.organization_id is None:
        same_organization: ColumnElement[bool] = false()
    else:
        same_organization = and_(
            visibility == Visibility.ORGANIZATION,
            User.organization_id == viewer.organization_id,
        )
    return or_(visibility == Visibility.PUBLIC, same_organization)


def list_users(s: Session, viewer: User, skip: int = 0, limit: int = 100) -> list[User]:
    """viewer に見える利用者(本人と、プロフィールを viewer に公開している人)。"""
    stmt = (
        select(User)
        .where(or_(User.id == viewer.id, visible_condition(viewer, User.profile_visibility)))
        .order_by(User.id)
        .offset(skip)
        .limit(limit)
    )
    return list(s.scalars(stmt))


def create_user(s: Session, user_in: UserCreate, sub: str | None = None) -> User:
    user = User(**user_in.model_dump(), sub=sub)
    s.add(user)
    s.flush()
    return user


def get_or_create_user(s: Session, user_in: UserCreate, sub: str) -> User:
    user = get_user_by_sub(s, sub)
    if user is not None:
        return user
    try:
        # 入れ損ねたときに、この行の分だけを巻き戻す(呼び出し側の行は残す)
        with s.begin_nested():
            return create_user(s, user_in, sub=sub)
    except IntegrityError:
        # users.sub is unique, so a request racing this one for the same sub
        # (every page fires this on load) lost the insert; the row the winner
        # created is the one to hand back.
        user = get_user_by_sub(s, sub)
        if user is None:
            raise
        return user


def update_user(s: Session, user: User, user_in: UserUpdate) -> User:
    for field, value in user_in.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    s.flush()
    return user
