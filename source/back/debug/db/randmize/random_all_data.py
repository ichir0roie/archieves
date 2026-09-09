

import random

from mods.factory_db import (
    EndFactory,
    FactorySession,
    GameFactory,
    MatchFactory,
    OrganizationFactory,
    PointFactory,
    RoundFactory,
    UserFactory,
)


ORGANIZATION_COUNT = 3
USER_COUNT = 10
GAME_COUNT = 30
MATCH_COUNT = 10
ROUND_COUNT = 100
ENDS_PER_ROUND = 6
POINTS_PER_END = 6

DISTANCES_M = [18, 30, 50, 70, 90]
TARGET_TYPES = ["92cm", "122cm", "compound"]


def _create_organizations() -> list:
    organizations = OrganizationFactory.create_batch(ORGANIZATION_COUNT)
    FactorySession.commit()
    return organizations


def _create_users(organizations: list) -> list:
    # None is a valid choice too - not every user belongs to an organization.
    candidates = organizations + [None]
    users = [
        UserFactory.create(organization=random.choice(candidates))
        for _ in range(USER_COUNT)
    ]
    FactorySession.commit()
    return users


def _create_games(users: list) -> list:
    games = [
        GameFactory.create(
            user=random.choice(users),
            game_size=random.randint(1, 10),
        )
        for _ in range(GAME_COUNT)
    ]
    FactorySession.commit()
    return games


def _create_matches(games: list) -> None:
    for game in random.sample(games, MATCH_COUNT):
        MatchFactory.create(game=game)
    FactorySession.commit()


def _create_rounds(games: list) -> list:
    # Track how many rounds each game has gotten so far, so Round.number
    # counts up per-game (1, 2, 3, ...) instead of globally.
    next_number_by_game_id: dict[int, int] = {}
    rounds = []
    for _ in range(ROUND_COUNT):
        game = random.choice(games)
        number = next_number_by_game_id.get(game.id, 0) + 1
        next_number_by_game_id[game.id] = number
        rounds.append(
            RoundFactory.create(
                game=game,
                number=number,
                end_size=ENDS_PER_ROUND,
                round_size=game.game_size,
                distance_m=random.choice(DISTANCES_M),
                target_type=random.choice(TARGET_TYPES),
            )
        )
    FactorySession.commit()
    return rounds


def _create_ends(rounds: list) -> list:
    ends = [
        EndFactory.create(round=round_, number=number)
        for round_ in rounds
        for number in range(1, ENDS_PER_ROUND + 1)
    ]
    FactorySession.commit()
    return ends


def _create_points(ends: list) -> None:
    for end in ends:
        for number in range(1, POINTS_PER_END + 1):
            PointFactory.create(end=end, number=number)
    FactorySession.commit()


def randomize_all_data() -> None:
    """Populate every table with random data via the factory_db factories,
    committing once per table (parent before child) so each table's rows are
    durably persisted - and their ids usable as foreign keys - before the
    next table is built."""
    organizations = _create_organizations()
    users = _create_users(organizations)
    games = _create_games(users)
    _create_matches(games)
    rounds = _create_rounds(games)
    ends = _create_ends(rounds)
    _create_points(ends)


if __name__ == "__main__":
    randomize_all_data()
