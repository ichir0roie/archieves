"""本人が発行する、記録を読むだけのトークン(Claude Code などに渡す)。

発行・一覧・失効は画面からログインした本人だけができる(トークンでトークンを増やさせない)。
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.access_token import MAX_TOKENS_PER_USER
from app.crud import access_token as access_token_crud
from app.db import User
from app.schemas.access_token import AccessTokenCreate, AccessTokenCreated, AccessTokenRead

router = APIRouter()


@router.get("/access-tokens", response_model=list[AccessTokenRead])
def list_access_tokens(
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> list[AccessTokenRead]:
    """本人のトークン。期限の切れたものも含む。新しい順。"""
    return access_token_crud.list_access_tokens(s, me.id)


@router.post("/access-tokens", response_model=AccessTokenCreated, status_code=201)
def create_access_token(
    token_in: AccessTokenCreate,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> AccessTokenCreated:
    """トークンを発行する。平文(token)はこの応答にしか載らない。"""
    if access_token_crud.count_access_tokens(s, me.id) >= MAX_TOKENS_PER_USER:
        raise HTTPException(status_code=409, detail="Too many access tokens")
    access_token, token = access_token_crud.create_access_token(
        s,
        me.id,
        token_in.name,
        token_in.expires_in_days,
    )
    result = AccessTokenCreated(
        **AccessTokenRead.model_validate(access_token).model_dump(),
        token=token,
    )
    s.commit()
    return result


@router.delete("/access-tokens/{access_token_id}", status_code=204)
def delete_access_token(
    access_token_id: int,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> None:
    """トークンを失効させる(行ごと消す)。"""
    access_token = deps.get_own_or_404(
        me,
        access_token_crud.get_access_token,
        s,
        access_token_id,
        detail="Access token not found",
    )
    access_token_crud.delete_access_token(s, access_token)
    s.commit()
