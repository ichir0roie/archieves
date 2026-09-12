import factory

from app.db.models.game_model import End, Game, Match, Point, Round
from mods.factory_db.base_class import BaseFactory
from mods.factory_db.models.system_model import UserFactory


class GameFactory(BaseFactory):
    class Meta:
        model = Game

    user = factory.SubFactory(UserFactory)
    recorded_at = factory.Faker("date_this_year")


class RoundFactory(BaseFactory):
    class Meta:
        model = Round

    game = factory.SubFactory(GameFactory)
    user_id = factory.LazyAttribute(lambda o: o.game.user_id)
    number = factory.Sequence(lambda n: n + 1)
    recorded_at = factory.Faker("date_this_year")


class EndFactory(BaseFactory):
    class Meta:
        model = End

    round = factory.SubFactory(RoundFactory)
    user_id = factory.LazyAttribute(lambda o: o.round.user_id)
    number = factory.Sequence(lambda n: n + 1)
    recorded_at = factory.Faker("date_this_year")


class PointFactory(BaseFactory):
    class Meta:
        model = Point

    end = factory.SubFactory(EndFactory)
    user_id = factory.LazyAttribute(lambda o: o.end.user_id)
    number = factory.Sequence(lambda n: n + 1)
    score = factory.Faker("random_int", min=0, max=11)
    x = factory.Faker("pyfloat", min_value=-100, max_value=100)
    y = factory.Faker("pyfloat", min_value=-100, max_value=100)
    recorded_at = factory.Faker("date_this_year")


class MatchFactory(BaseFactory):
    class Meta:
        model = Match

    game = factory.SubFactory(GameFactory)
    user_id = factory.LazyAttribute(lambda o: o.game.user_id)
    name = factory.Sequence(lambda n: f"Match {n}")
    link = factory.Faker("url")
