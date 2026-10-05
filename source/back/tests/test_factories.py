from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import End, Game, GameComment, Point, Round, User


def test_user_factory_persists_a_row(s: Session, factories) -> None:
    user = factories.UserFactory()

    assert user.id is not None
    assert s.get(User, user.id) is user


def test_a_factory_creates_the_rows_its_own_row_needs(s: Session, factories) -> None:
    point = factories.PointFactory()

    assert s.query(Point).count() == 1
    assert s.query(End).count() == 1
    assert s.query(Round).count() == 1
    assert s.query(Game).count() == 1
    assert s.query(User).count() == 1
    assert point.user_id == s.get_one(User, point.user_id).id


def test_passing_a_parent_attaches_to_it_instead(s: Session, factories) -> None:
    game = factories.GameFactory()
    first = factories.RoundFactory(game=game)
    second = factories.RoundFactory(game=game)

    assert {first.game_id, second.game_id} == {game.id}
    assert s.query(Game).count() == 1
    assert first.user_id == game.user_id


def test_a_round_is_created_scoreable(s: Session, factories) -> None:
    round_ = factories.RoundFactory()

    assert round_.end_size == 6
    assert round_.distance_m == 70
    assert round_.target_type == "122cm"


def test_overrides_win_over_the_factory_defaults(s: Session, factories) -> None:
    user = factories.UserFactory(name="Yumi", age=21)
    game = factories.GameFactory(user=user, game_size=4)

    assert (user.name, user.age) == ("Yumi", 21)
    assert game.game_size == 4
    assert game.user_id == user.id


def test_create_batch_makes_many_distinct_rows(s: Session, factories) -> None:
    users = factories.UserFactory.create_batch(5)

    assert len({u.id for u in users}) == 5
    assert s.query(User).count() == 5


def test_comment_factories_attach_to_their_entity(s: Session, factories) -> None:
    comment = factories.GameCommentFactory()

    assert s.query(GameComment).count() == 1
    assert comment.game_id == s.query(Game).one().id
    assert comment.body


def test_the_user_fixture_is_a_persisted_user(s: Session, user) -> None:
    assert s.get(User, user.id) is user


def test_rows_built_by_factories_are_visible_through_the_api(
    client: TestClient, factories
) -> None:
    user = factories.UserFactory(name="Yumi")
    factories.GameFactory.create_batch(3, user=user)

    res = client.get(f"/api/v1/games?user_id={user.id}")
    assert res.status_code == 200
    assert len(res.json()) == 3
    assert {g["user_id"] for g in res.json()} == {user.id}


def test_the_current_user_fixture_is_who_the_client_authenticates_as(
    client: TestClient, current_user
) -> None:
    res = client.get("/api/v1/users/me")

    assert res.status_code == 200
    assert res.json()["id"] == current_user.id


def test_each_test_starts_from_an_empty_database(s: Session) -> None:
    assert s.query(User).count() == 0
    assert s.query(Game).count() == 0
