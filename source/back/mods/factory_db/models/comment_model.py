import factory

from app.db.models.comment_model import EndComment, GameComment, RoundComment
from mods.factory_db.base_class import BaseFactory
from mods.factory_db.models.game_model import EndFactory, GameFactory, RoundFactory


class GameCommentFactory(BaseFactory):
    class Meta:
        model = GameComment

    game = factory.SubFactory(GameFactory)
    user_id = factory.LazyAttribute(lambda o: o.game.user_id)
    body = factory.Faker("sentence")


class RoundCommentFactory(BaseFactory):
    class Meta:
        model = RoundComment

    round = factory.SubFactory(RoundFactory)
    user_id = factory.LazyAttribute(lambda o: o.round.user_id)
    body = factory.Faker("sentence")


class EndCommentFactory(BaseFactory):
    class Meta:
        model = EndComment

    end = factory.SubFactory(EndFactory)
    user_id = factory.LazyAttribute(lambda o: o.end.user_id)
    body = factory.Faker("sentence")
