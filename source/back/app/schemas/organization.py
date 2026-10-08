from pydantic import BaseModel

from app.schemas.base import ResponseModel


class OrganizationBase(BaseModel):
    name: str
    formal_name: str | None = None
    description: str | None = None
    homepage_url: str | None = None
    location: str | None = None
    parent_organization_id: int | None = None


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationSummary(ResponseModel):
    id: int
    name: str


class OrganizationRead(OrganizationBase, ResponseModel):
    id: int
    parent_organization: OrganizationSummary | None = None
