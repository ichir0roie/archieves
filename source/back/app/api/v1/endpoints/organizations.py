from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import organization as organization_crud
from app.schemas.organization import OrganizationCreate, OrganizationRead, OrganizationSummary

router = APIRouter()


def _check_parent_organization_exists(db: Session, parent_organization_id: int | None) -> None:
    if parent_organization_id is not None and organization_crud.get_organization(
        db, parent_organization_id
    ) is None:
        raise HTTPException(status_code=404, detail="Parent organization not found")


@router.get("", response_model=list[OrganizationRead])
def list_organizations(
    skip: int = 0, limit: int = 100, db: Session = Depends(deps.get_session)
) -> list[OrganizationRead]:
    return organization_crud.list_organizations(db, skip=skip, limit=limit)


@router.get("/search", response_model=list[OrganizationSummary])
def search_organizations(
    q: str, limit: int = 10, db: Session = Depends(deps.get_session)
) -> list[OrganizationSummary]:
    return organization_crud.search_organizations_by_prefix(db, q, limit=limit)


@router.post("", response_model=OrganizationRead, status_code=201)
def create_organization(
    organization_in: OrganizationCreate, db: Session = Depends(deps.get_session)
) -> OrganizationRead:
    if organization_crud.get_organization_by_name(db, organization_in.name):
        raise HTTPException(status_code=409, detail="Organization name already taken")
    _check_parent_organization_exists(db, organization_in.parent_organization_id)
    return organization_crud.create_organization(db, organization_in)


@router.post("/find-or-create", response_model=OrganizationRead)
def find_or_create_organization(
    organization_in: OrganizationCreate, db: Session = Depends(deps.get_session)
) -> OrganizationRead:
    _check_parent_organization_exists(db, organization_in.parent_organization_id)
    return organization_crud.get_or_create_organization(db, organization_in)


@router.get("/{organization_id}", response_model=OrganizationRead)
def get_organization(
    organization_id: int, db: Session = Depends(deps.get_session)
) -> OrganizationRead:
    return deps.get_or_404(
        organization_crud.get_organization, db, organization_id, detail="Organization not found"
    )
