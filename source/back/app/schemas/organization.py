from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator

from app.core.names import (
    MAX_ORGANIZATION_DESCRIPTION_LENGTH,
    MAX_ORGANIZATION_FORMAL_NAME_LENGTH,
    MAX_ORGANIZATION_LOCATION_LENGTH,
    MAX_ORGANIZATION_NAME_LENGTH,
    MAX_URL_LENGTH,
)
from app.schemas.base import ResponseModel


class OrganizationBase(BaseModel):
    name: str
    formal_name: str | None = None
    description: str | None = None
    homepage_url: str | None = None
    location: str | None = None
    parent_organization_id: int | None = None


class OrganizationCreate(OrganizationBase):
    # 長さは db の列と揃え、超えたら 500 でなく 422 にする
    # (応答の OrganizationBase には付けない。今ある行が合わずに読めなくなるため)
    name: str = Field(min_length=1, max_length=MAX_ORGANIZATION_NAME_LENGTH)
    formal_name: str | None = Field(
        default=None,
        max_length=MAX_ORGANIZATION_FORMAL_NAME_LENGTH,
    )
    description: str | None = Field(
        default=None,
        max_length=MAX_ORGANIZATION_DESCRIPTION_LENGTH,
    )
    homepage_url: str | None = Field(default=None, max_length=MAX_URL_LENGTH)
    location: str | None = Field(default=None, max_length=MAX_ORGANIZATION_LOCATION_LENGTH)

    # 組織はだれでも作れ、ほかの人の画面にリンクとして出るので、
    # javascript: などの URL を入れさせない
    @field_validator("homepage_url")
    @classmethod
    def _http_url(cls, value: str | None) -> str | None:
        url = None if value is None else urlparse(value)
        if url is not None and (url.scheme not in ("http", "https") or not url.netloc):
            raise ValueError("homepage_url must be an http(s) URL")
        return value


class OrganizationSummary(ResponseModel):
    id: int
    name: str


class OrganizationRead(OrganizationBase, ResponseModel):
    id: int
    parent_organization: OrganizationSummary | None = None
