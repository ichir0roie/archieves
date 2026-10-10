from datetime import date

from pydantic import BaseModel, computed_field, field_validator

from app.schemas.base import ResponseModel


def _reject_future(value: date | None) -> date | None:
    if value is not None and value > date.today():
        raise ValueError("birth_date must not be in the future")
    return value


def calc_age(birth_date: date, today: date) -> int:
    """満年齢。誕生日の前日までは一つ若い。"""
    had_birthday = (today.month, today.day) >= (birth_date.month, birth_date.day)
    return today.year - birth_date.year - (0 if had_birthday else 1)


class UserBase(BaseModel):
    name: str
    nickname: str | None = None
    birth_date: date | None = None
    organization_id: int | None = None
    region_id: int | None = None

    _check_birth_date = field_validator("birth_date")(_reject_future)


class UserCreate(UserBase):
    pass


class UserFindOrCreate(UserBase):
    sub: str


class UserUpdate(BaseModel):
    name: str | None = None
    nickname: str | None = None
    birth_date: date | None = None
    organization_id: int | None = None
    region_id: int | None = None

    _check_birth_date = field_validator("birth_date")(_reject_future)


class UserRead(UserBase, ResponseModel):
    id: int
    sub: str | None = None

    # 年齢は保存せず、読むたびに生年月日から出す
    @computed_field
    @property
    def age(self) -> int | None:
        if self.birth_date is None:
            return None
        return calc_age(self.birth_date, date.today())


class MeRead(UserRead):
    """本人の行。管理者かどうかは本人にだけ返し、他人の行(UserRead)には載せない。"""

    is_admin: bool
