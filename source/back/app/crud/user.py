from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import User
from app.schemas.user import UserCreate, UserUpdate


def get_user(s: Session, user_id: int) -> User | None:
    return s.get(User, user_id)


def get_user_by_sub(s: Session, sub: str) -> User | None:
    return s.scalar(select(User).where(User.sub == sub))


def list_users(s: Session, skip: int = 0, limit: int = 100) -> list[User]:
    return list(s.scalars(select(User).order_by(User.id).offset(skip).limit(limit)))


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
