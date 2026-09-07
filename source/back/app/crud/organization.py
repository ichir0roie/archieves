from sqlalchemy.orm import Session

from app.db import Organization
from app.schemas.organization import OrganizationCreate


def get_organization(db: Session, organization_id: int) -> Organization | None:
    return db.get(Organization, organization_id)


def get_organization_by_name(db: Session, name: str) -> Organization | None:
    return db.query(Organization).filter(Organization.name == name).first()


def list_organizations(db: Session, skip: int = 0, limit: int = 100) -> list[Organization]:
    return list(
        db.query(Organization).order_by(Organization.id).offset(skip).limit(limit).all()
    )


def search_organizations_by_prefix(
    db: Session, prefix: str, limit: int = 10
) -> list[Organization]:
    return list(
        db.query(Organization)
        .filter(Organization.name.ilike(f"{prefix}%"))
        .order_by(Organization.name)
        .limit(limit)
        .all()
    )


def create_organization(db: Session, organization_in: OrganizationCreate) -> Organization:
    organization = Organization(**organization_in.model_dump())
    db.add(organization)
    db.commit()
    db.refresh(organization)
    return organization


def get_or_create_organization(db: Session, organization_in: OrganizationCreate) -> Organization:
    organization = get_organization_by_name(db, organization_in.name)
    if organization is not None:
        return organization
    return create_organization(db, organization_in)
