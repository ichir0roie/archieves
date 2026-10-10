import factory

from app.db.models.support_model import Announcement, Feedback
from mods.factory_db.base_class import BaseFactory
from mods.factory_db.models.system_model import UserFactory


class FeedbackFactory(BaseFactory):
    class Meta:
        model = Feedback

    user = factory.SubFactory(UserFactory)
    email = factory.Faker("email")
    body = factory.Faker("sentence")


class AnnouncementFactory(BaseFactory):
    class Meta:
        model = Announcement

    body = factory.Faker("sentence")
