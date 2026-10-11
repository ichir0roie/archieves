import factory

from app.db.models.system_model import Organization, Region, User
from mods.factory_db.base_class import BaseFactory


class OrganizationFactory(BaseFactory):
    class Meta:
        model = Organization

    name = factory.Sequence(lambda n: f"organization{n}")
    formal_name = factory.Faker("company")
    description = factory.Faker("sentence")
    homepage_url = factory.Faker("url")
    location = factory.Faker("city")


class RegionFactory(BaseFactory):
    class Meta:
        model = Region

    name = factory.Faker("state")


class UserFactory(BaseFactory):
    class Meta:
        model = User

    name = factory.Faker("name")
    nickname = factory.Faker("first_name")
