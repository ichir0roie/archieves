import factory

from app.db.models.game_model import End, Game, Point, Round
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
    recorded_at = factory.LazyAttribute(lambda o: o.game.recorded_at)
    end_size = 6
    round_size = 6
    distance_m = 70
    target_type = "122cm"


class EndFactory(BaseFactory):
    class Meta:
        model = End

    round = factory.SubFactory(RoundFactory)
    user_id = factory.LazyAttribute(lambda o: o.round.user_id)
    number = factory.Sequence(lambda n: n + 1)
    recorded_at = factory.LazyAttribute(lambda o: o.round.recorded_at)


class PointFactory(BaseFactory):
    class Meta:
        model = Point

    end = factory.SubFactory(EndFactory)
    user_id = factory.LazyAttribute(lambda o: o.end.user_id)
    number = factory.Sequence(lambda n: n + 1)
    score = factory.Faker("random_int", min=0, max=11)
    x = factory.Faker("pyfloat", min_value=0, max_value=1)
    y = factory.Faker("pyfloat", min_value=0, max_value=1)
    recorded_at = factory.LazyAttribute(lambda o: o.end.recorded_at)
