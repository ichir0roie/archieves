from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import Organization, User
from app.schemas.organization import OrganizationCreate, OrganizationUpdate


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


def list_organizations_with_user_count(s: Session) -> list[tuple[Organization, int]]:
    """すべての組織と、それぞれに所属している利用者の数。番号の順"""
    user_count = func.count(User.id)
    stmt = (
        select(Organization, user_count)
        .outerjoin(User, User.organization_id == Organization.id)
        .group_by(Organization.id)
        .order_by(Organization.id)
    )
    return [(organization, count) for organization, count in s.execute(stmt).tuples()]


def count_users(s: Session, organization_id: int) -> int:
    stmt = select(func.count(User.id)).where(User.organization_id == organization_id)
    return s.scalar(stmt) or 0


def is_self_or_descendant(s: Session, organization_id: int, candidate_id: int) -> bool:
    """candidate_id の組織が organization_id 自身か、その下(子・孫…)にあるか。

    上位の組織をたどって organization_id に行き着けば下にある。
    上位に据えると輪になるので、それを弾くのに使う
    """
    seen: set[int] = set()
    current: int | None = candidate_id
    while current is not None and current not in seen:
        if current == organization_id:
            return True
        seen.add(current)
        current = s.scalar(
            select(Organization.parent_organization_id).where(Organization.id == current)
        )
    return False


def update_organization(
    s: Session,
    organization: Organization,
    organization_in: OrganizationUpdate,
) -> Organization:
    for field, value in organization_in.model_dump(exclude_unset=True).items():
        setattr(organization, field, value)
    s.flush()
    # 上位の組織は lazy="joined" で読んだ値が残るので、id を変えたら読み直す
    s.refresh(organization)
    return organization
