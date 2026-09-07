from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import organization as organization_crud
from app.crud import profile as profile_crud
from app.crud import user as user_crud
from app.schemas.profile import UserProfile
from app.schemas.user import UserCreate, UserRead, UserUpdate

router = APIRouter()


def _check_organization_exists(db: Session, organization_id: int | None) -> None:
    if organization_id is not None and organization_crud.get_organization(
        db, organization_id
    ) is None:
        raise HTTPException(status_code=404, detail="Organization not found")


@router.get("", response_model=list[UserRead])
def list_users(
    skip: int = 0, limit: int = 100, db: Session = Depends(deps.get_session)
) -> list[UserRead]:
    return user_crud.list_users(db, skip=skip, limit=limit)


@router.post("", response_model=UserRead, status_code=201)
def create_user(user_in: UserCreate, db: Session = Depends(deps.get_session)) -> UserRead:
    _check_organization_exists(db, user_in.organization_id)
    return user_crud.create_user(db, user_in)


@router.post("/find-or-create", response_model=UserRead)
def find_or_create_user(
    user_in: UserCreate,
    current_user: deps.Claims = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_session),
) -> UserRead:
    _check_organization_exists(db, user_in.organization_id)
    return user_crud.get_or_create_user(db, user_in, sub=current_user.sub)


@router.get("/me", response_model=UserRead)
def get_my_user(
    current_user: deps.Claims = Depends(deps.get_current_user),
    db: Session = Depends(deps.get_session),
) -> UserRead:
    user = user_crud.get_user_by_sub(db, current_user.sub)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: int, db: Session = Depends(deps.get_session)) -> UserRead:
    return deps.get_or_404(user_crud.get_user, db, user_id, detail="User not found")


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int, user_in: UserUpdate, db: Session = Depends(deps.get_session)
) -> UserRead:
    user = deps.get_or_404(user_crud.get_user, db, user_id, detail="User not found")
    _check_organization_exists(db, user_in.organization_id)
    return user_crud.update_user(db, user, user_in)


@router.get("/{sub}/profile", response_model=UserProfile)
def get_user_profile(sub: str, db: Session = Depends(deps.get_session)) -> UserProfile:
    user = user_crud.get_user_by_sub(db, sub)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return deps.get_or_404(profile_crud.get_user_profile, db, user.id, detail="User not found")
