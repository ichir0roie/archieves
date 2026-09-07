from pydantic import BaseModel, ConfigDict


class OrganizationBase(BaseModel):
    name: str
    formal_name: str | None = None
    description: str | None = None
    homepage_url: str | None = None
    location: str | None = None
    parent_organization_id: int | None = None


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class OrganizationRead(OrganizationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_organization: OrganizationSummary | None = None
