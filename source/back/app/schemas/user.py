from pydantic import BaseModel, Field

from app.schemas.base import ResponseModel


class UserBase(BaseModel):
    name: str
    nickname: str | None = None
    age: int | None = Field(default=None, ge=0)
    organization_id: int | None = None
    region_id: int | None = None


class UserCreate(UserBase):
    pass


class UserFindOrCreate(UserBase):
    sub: str


class UserUpdate(BaseModel):
    name: str | None = None
    nickname: str | None = None
    age: int | None = Field(default=None, ge=0)
    organization_id: int | None = None
    region_id: int | None = None


class UserRead(UserBase, ResponseModel):
    id: int
    sub: str | None = None
