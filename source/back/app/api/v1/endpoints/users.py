from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.core.errors import CURRENT_USER_NOT_REGISTERED, NotFoundError
from app.crud import organization as organization_crud
from app.crud import profile as profile_crud
from app.crud import user as user_crud
from app.db import User
from app.schemas.profile import UserProfile
from app.schemas.user import MeRead, UserCreate, UserFindOrCreate, UserRead, UserUpdate

router = APIRouter()
public_router = APIRouter()


def _check_organization_exists(
    s: Session,
    organization_id: int | None,
) -> None:
    if (
        organization_id is not None
        and organization_crud.get_organization(s, organization_id) is None
    ):
        raise NotFoundError("Organization not found")


@router.get("", response_model=list[UserRead])
def list_users(
    skip: int = 0,
    limit: int = 100,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> list[UserRead]:
    return user_crud.list_users(s, me, skip=skip, limit=limit)


@router.post("", response_model=UserRead, status_code=201)
def create_user(
    user_in: UserCreate,
    s: Session = Depends(deps.get_session),
) -> UserRead:
    _check_organization_exists(s, user_in.organization_id)
    result = user_crud.create_user(s, user_in)
    s.commit()
    return result


@public_router.post("/find-or-create", response_model=UserRead)
def find_or_create_user(
    user_in: UserFindOrCreate,
    s: Session = Depends(deps.get_session),
) -> UserRead:
    _check_organization_exists(s, user_in.organization_id)
    user_data = UserCreate(**user_in.model_dump(exclude={"sub"}))
    result = user_crud.get_or_create_user(s, user_data, sub=user_in.sub)
    s.commit()
    return result


@router.post("/me/ensure", response_model=MeRead)
def ensure_current_user(
    user_in: UserCreate,
    current_user: deps.Claims = Depends(deps.get_current_user),
    s: Session = Depends(deps.get_session),
) -> MeRead:
    _check_organization_exists(s, user_in.organization_id)
    result = user_crud.get_or_create_user(s, user_in, sub=current_user.sub)
    s.commit()
    return result


@router.get("/me", response_model=MeRead)
def get_my_user(
    current_user: deps.Claims = Depends(deps.get_current_user),
    s: Session = Depends(deps.get_session),
) -> MeRead:
    user = user_crud.get_user_by_sub(s, current_user.sub)
    if user is None:
        raise NotFoundError(CURRENT_USER_NOT_REGISTERED)
    return user


@router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: int,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> UserRead:
    user = deps.get_or_404(user_crud.get_user, s, user_id, detail="User not found")
    deps.require_profile_visible(me, user)
    return user


@router.patch("/{user_id}", response_model=MeRead)
def update_user(
    user_id: int,
    user_in: UserUpdate,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> MeRead:
    user = deps.get_or_404(user_crud.get_user, s, user_id, detail="User not found")
    deps.require_self(me, user.id)
    _check_organization_exists(s, user_in.organization_id)
    result = user_crud.update_user(s, user, user_in)
    s.commit()
    return result


@router.get("/{sub}/profile", response_model=UserProfile)
def get_user_profile(
    sub: str,
    me: User = Depends(deps.get_me),
    s: Session = Depends(deps.get_session),
) -> UserProfile:
    user = user_crud.get_user_by_sub(s, sub)
    if user is None:
        raise NotFoundError("User not found")
    deps.require_profile_visible(me, user)
    return deps.get_or_404(profile_crud.get_user_profile, s, user.id, detail="User not found")
