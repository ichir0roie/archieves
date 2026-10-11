import factory

from app.db.models.diary_model import Diary
from mods.factory_db.base_class import BaseFactory
from mods.factory_db.models.system_model import UserFactory


class DiaryFactory(BaseFactory):
    class Meta:
        model = Diary

    user = factory.SubFactory(UserFactory)
    body = factory.Faker("sentence")
