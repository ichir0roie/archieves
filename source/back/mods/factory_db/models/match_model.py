import secrets
from datetime import UTC, datetime

import factory

from app.core.match_codes import new_match_id
from app.db.models.match_model import Match
from mods.factory_db.base_class import BaseFactory
from mods.factory_db.models.system_model import UserFactory


class MatchFactory(BaseFactory):
    class Meta:
        model = Match

    # テストの行は db の連番を使わない。番号を乱数にして、同じテストの中で重ならないようにする
    id = factory.LazyFunction(lambda: new_match_id(datetime.now(UTC), 0, secrets.randbelow(10**9)))
    organizer = factory.SubFactory(UserFactory)
    held_at = factory.LazyFunction(lambda: datetime.now(UTC))
    game_size = 2
    round_size = 6
    end_size = 6
