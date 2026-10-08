from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Organization
from app.schemas.organization import OrganizationCreate


def get_organization(s: Session, organization_id: int) -> Organization | None:
    return s.get(Organization, organization_id)


def get_organization_by_name(s: Session, name: str) -> Organization | None:
    return s.scalar(select(Organization).where(Organization.name == name))


def list_organizations(s: Session, skip: int = 0, limit: int = 100) -> list[Organization]:
    stmt = select(Organization).order_by(Organization.id).offset(skip).limit(limit)
    return list(s.scalars(stmt))


def search_organizations_by_prefix(
    s: Session, prefix: str, limit: int = 10
) -> list[Organization]:
    stmt = (
        select(Organization)
        .where(Organization.name.ilike(f"{prefix}%"))
        .order_by(Organization.name)
        .limit(limit)
    )
    return list(s.scalars(stmt))


def create_organization(s: Session, organization_in: OrganizationCreate) -> Organization:
    organization = Organization(**organization_in.model_dump())
    s.add(organization)
    s.flush()
    return organization


def get_or_create_organization(s: Session, organization_in: OrganizationCreate) -> Organization:
    organization = get_organization_by_name(s, organization_in.name)
    if organization is not None:
        return organization
    return create_organization(s, organization_in)
