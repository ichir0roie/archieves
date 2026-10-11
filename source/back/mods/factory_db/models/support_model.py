import factory

from app.core.support import ErrorReportKind
from app.db.models.support_model import Announcement, ErrorReport, Feedback
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


class ErrorReportFactory(BaseFactory):
    class Meta:
        model = ErrorReport

    user = factory.SubFactory(UserFactory)
    kind = ErrorReportKind.API
    status_code = 500
    page_path = "/score-log"
    method = "GET"
    api_path = "/api/v1/games"
    message = factory.Faker("sentence")
