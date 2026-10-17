"""本人の行。他人のプロフィールは endpoints/public.py が返す。

利用者は id で指さず、ログイン(またはトークン)から引く。
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.core.errors import NotFoundError
from app.crud import organization as organization_crud
from app.crud import user as user_crud
from app.db import User
from app.schemas.user import MeRead, UserCreate, UserUpdate

router = APIRouter()


def _check_organization_exists(
    s: Session,
    organization_id: int | None,
) -> None:
    if (
        organization_id is not None
        and organization_crud.get_organization(s, organization_id) is None
    ):
        raise NotFoundError("Organization not found")


@router.post("/me/ensure", response_model=MeRead)
def ensure_current_user(
    user_in: UserCreate,
    claims: deps.Claims = Depends(deps.get_browser_claims),
    s: Session = Depends(deps.get_session),
) -> MeRead:
    _check_organization_exists(s, user_in.organization_id)
    result = user_crud.get_or_create_user(s, user_in, sub=claims.sub)
    s.commit()
    return result


@router.get("/me", response_model=MeRead)
def get_my_user(
    me: User = Depends(deps.get_reader),
) -> MeRead:
    return me


@router.patch("/me", response_model=MeRead)
def update_my_user(
    user_in: UserUpdate,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> MeRead:
    _check_organization_exists(s, user_in.organization_id)
    result = user_crud.update_user(s, me, user_in)
    s.commit()
    return result


@router.delete("/me", status_code=204)
def delete_my_user(
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> None:
    """本人のアカウントと記録をすべて消す。Cognito の利用者はフロントが消す。"""
    user_crud.delete_user(s, me)
    s.commit()
