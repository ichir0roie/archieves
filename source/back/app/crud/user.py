from sqlalchemy import ColumnElement, and_, delete, false, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.visibility import Visibility
from app.db import User
from app.schemas.user import UserCreate, UserUpdate


def get_user_by_sub(s: Session, sub: str) -> User | None:
    return s.scalar(select(User).where(User.sub == sub))


def visible_condition(viewer: User | None, visibility: ColumnElement[str]) -> ColumnElement[bool]:
    """core/visibility.py の is_visible() を SQL で書いたもの。

    User を引く select の where に使う。viewer が None(ログインしていない)なら全体公開の分だけ。
    """
    if viewer is None or viewer.organization_id is None:
        same_organization: ColumnElement[bool] = false()
    else:
        same_organization = and_(
            visibility == Visibility.ORGANIZATION,
            User.organization_id == viewer.organization_id,
        )
    return or_(visibility == Visibility.PUBLIC, same_organization)


def get_user_with_organization(s: Session, user_id: int) -> User | None:
    """所属の組織(User.organization)を読み込んだ利用者の行。"""
    return s.scalar(
        select(User).options(joinedload(User.organization)).where(User.id == user_id)
    )


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


def delete_user(s: Session, user: User) -> None:
    """利用者の行を消す。試合・日記・コメント・意見・エラーの集積・トークンは、
    外部キーの ON DELETE CASCADE で db が一緒に消す(relationship は noload なので、
    ORM の cascade には任せない)。"""
    s.execute(delete(User).where(User.id == user.id))
