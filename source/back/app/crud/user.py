from sqlalchemy.orm import Session

from app.db import User
from app.schemas.user import UserCreate, UserUpdate


def get_user(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_user_by_sub(db: Session, sub: str) -> User | None:
    return db.query(User).filter(User.sub == sub).first()


def list_users(db: Session, skip: int = 0, limit: int = 100) -> list[User]:
    return list(db.query(User).order_by(User.id).offset(skip).limit(limit).all())


def create_user(db: Session, user_in: UserCreate, sub: str | None = None) -> User:
    user = User(**user_in.model_dump(), sub=sub)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_or_create_user(db: Session, user_in: UserCreate, sub: str) -> User:
    user = get_user_by_sub(db, sub)
    if user is not None:
        return user
    return create_user(db, user_in, sub=sub)


def update_user(db: Session, user: User, user_in: UserUpdate) -> User:
    for field, value in user_in.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user
