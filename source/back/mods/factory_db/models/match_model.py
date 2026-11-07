from datetime import UTC, datetime

import factory

from app.core.match_codes import new_match_id
from app.db.models.match_model import Match
from mods.factory_db.base_class import BaseFactory
from mods.factory_db.models.system_model import UserFactory


class MatchFactory(BaseFactory):
    class Meta:
        model = Match

    id = factory.LazyFunction(new_match_id)
    organizer = factory.SubFactory(UserFactory)
    held_at = factory.LazyFunction(lambda: datetime.now(UTC))
    game_size = 2
    round_size = 6
    end_size = 6
