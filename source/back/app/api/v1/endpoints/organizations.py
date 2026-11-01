from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.api.pagination import Limit, Skip
from app.core.errors import NotFoundError, UnprocessableError
from app.crud import organization as organization_crud
from app.db import Organization
from app.schemas.organization import (
    AdminOrganizationRead,
    OrganizationCreate,
    OrganizationRead,
    OrganizationSummary,
    OrganizationUpdate,
)

# 組織は持ち主のいない行。画面からログインした人だけが使い、トークンでは通さない
router = APIRouter()


def _check_parent_organization_exists(
    s: Session,
    parent_organization_id: int | None,
) -> None:
    if (
        parent_organization_id is not None
        and organization_crud.get_organization(s, parent_organization_id) is None
    ):
        raise NotFoundError("Parent organization not found")


@router.get(
    "",
    response_model=list[OrganizationRead],
    dependencies=[Depends(deps.get_browser_claims)],
)
def list_organizations(
    skip: Skip = 0,
    limit: Limit = 100,
    s: Session = Depends(deps.get_session),
) -> list[OrganizationRead]:
    return organization_crud.list_organizations(
        s,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/search",
    response_model=list[OrganizationSummary],
    dependencies=[Depends(deps.get_browser_claims)],
)
def search_organizations(
    q: str,
    limit: Limit = 10,
    s: Session = Depends(deps.get_session),
) -> list[OrganizationSummary]:
    return organization_crud.search_organizations_by_prefix(
        s,
        q,
        limit=limit,
    )


@router.post(
    "",
    response_model=OrganizationRead,
    status_code=201,
    dependencies=[Depends(deps.get_browser_claims)],
)
def create_organization(
    organization_in: OrganizationCreate,
    s: Session = Depends(deps.get_session),
) -> OrganizationRead:
    if organization_crud.get_organization_by_name(s, organization_in.name):
        raise HTTPException(status_code=409, detail="Organization name already taken")
    _check_parent_organization_exists(s, organization_in.parent_organization_id)
    result = organization_crud.create_organization(s, organization_in)
    s.commit()
    return result


@router.post(
    "/find-or-create",
    response_model=OrganizationRead,
    dependencies=[Depends(deps.get_browser_claims)],
)
def find_or_create_organization(
    organization_in: OrganizationCreate,
    s: Session = Depends(deps.get_session),
) -> OrganizationRead:
    _check_parent_organization_exists(s, organization_in.parent_organization_id)
    result = organization_crud.get_or_create_organization(s, organization_in)
    s.commit()
    return result


@router.get(
    "/{organization_id}",
    response_model=OrganizationRead,
    dependencies=[Depends(deps.get_browser_claims)],
)
def get_organization(
    organization_id: int,
    s: Session = Depends(deps.get_session),
) -> OrganizationRead:
    return deps.get_or_404(
        organization_crud.get_organization,
        s,
        organization_id,
        detail="Organization not found",
    )


# 管理者が組織を直す。組織はだれでも作れる(所属に名前を打てば find-or-create で増える)ので、
# 名前・所在・ホームページなどの手入れは管理者がする
admin_router = APIRouter()


def _to_admin_read(organization: Organization, user_count: int) -> AdminOrganizationRead:
    return AdminOrganizationRead.model_validate(
        {
            **OrganizationRead.model_validate(organization).model_dump(),
            "user_count": user_count,
        }
    )


@admin_router.get(
    "",
    response_model=list[AdminOrganizationRead],
    dependencies=[Depends(deps.get_admin)],
)
def list_admin_organizations(
    s: Session = Depends(deps.get_session),
) -> list[AdminOrganizationRead]:
    return [
        _to_admin_read(organization, user_count)
        for organization, user_count in organization_crud.list_organizations_with_user_count(s)
    ]


@admin_router.patch(
    "/{organization_id}",
    response_model=AdminOrganizationRead,
    dependencies=[Depends(deps.get_admin)],
)
def update_organization(
    organization_id: int,
    organization_in: OrganizationUpdate,
    s: Session = Depends(deps.get_session),
) -> AdminOrganizationRead:
    organization = deps.get_or_404(
        organization_crud.get_organization,
        s,
        organization_id,
        detail="Organization not found",
    )
    fields = organization_in.model_fields_set
    if "name" in fields and organization_in.name != organization.name:
        if organization_crud.get_organization_by_name(s, organization_in.name or ""):
            raise HTTPException(status_code=409, detail="Organization name already taken")
    parent_id = organization_in.parent_organization_id
    if "parent_organization_id" in fields and parent_id is not None:
        _check_parent_organization_exists(s, parent_id)
        if organization_crud.is_self_or_descendant(s, organization.id, parent_id):
            raise UnprocessableError(
                "Parent organization cannot be the organization itself or one under it"
            )
    result = organization_crud.update_organization(s, organization, organization_in)
    user_count = organization_crud.count_users(s, result.id)
    s.commit()
    return _to_admin_read(result, user_count)
