from sqlalchemy.orm import Session

from app.db import Organization
from app.schemas.organization import OrganizationCreate


def get_organization(s: Session, organization_id: int) -> Organization | None:
    return s.get(Organization, organization_id)


def get_organization_by_name(s: Session, name: str) -> Organization | None:
    return s.query(Organization).filter(Organization.name == name).first()


def list_organizations(s: Session, skip: int = 0, limit: int = 100) -> list[Organization]:
    return list(
        s.query(Organization).order_by(Organization.id).offset(skip).limit(limit).all()
    )


def search_organizations_by_prefix(
    s: Session, prefix: str, limit: int = 10
) -> list[Organization]:
    return list(
        s.query(Organization)
        .filter(Organization.name.ilike(f"{prefix}%"))
        .order_by(Organization.name)
        .limit(limit)
        .all()
    )


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
