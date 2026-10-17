from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.access_token import DISPLAY_PREFIX_LENGTH, generate_token, hash_token
from app.db import AccessToken, User


def create_access_token(
    s: Session,
    user_id: int,
    name: str,
    expires_in_days: int,
) -> tuple[AccessToken, str]:
    """作った行と、平文のトークン。平文はこの時にしか分からない。"""
    token = generate_token()
    access_token = AccessToken(
        user_id=user_id,
        name=name,
        token_hash=hash_token(token),
        token_prefix=token[:DISPLAY_PREFIX_LENGTH],
        expires_at=datetime.now(UTC) + timedelta(days=expires_in_days),
    )
    s.add(access_token)
    s.flush()
    s.refresh(access_token)
    return access_token, token


def list_access_tokens(s: Session, user_id: int) -> list[AccessToken]:
    """期限の切れたものも含める(切れたことを画面で見せ、消させる)。新しい順。"""
    return list(
        s.scalars(
            select(AccessToken)
            .where(AccessToken.user_id == user_id)
            .order_by(AccessToken.created_at.desc(), AccessToken.id.desc())
        )
    )


def count_access_tokens(s: Session, user_id: int) -> int:
    return s.scalar(
        select(func.count(AccessToken.id)).where(AccessToken.user_id == user_id)
    ) or 0


def get_access_token(s: Session, access_token_id: int) -> AccessToken | None:
    return s.get(AccessToken, access_token_id)


def delete_access_token(s: Session, access_token: AccessToken) -> None:
    s.execute(delete(AccessToken).where(AccessToken.id == access_token.id))


def get_access_token_owner(s: Session, token: str) -> tuple[AccessToken, User] | None:
    """平文のトークンが、期限の内の発行済みのものなら、その行と持ち主。"""
    row = s.execute(
        select(AccessToken, User)
        .join(User, User.id == AccessToken.user_id)
        .where(
            AccessToken.token_hash == hash_token(token),
            AccessToken.expires_at > func.now(),
        )
    ).one_or_none()
    return None if row is None else (row[0], row[1])
