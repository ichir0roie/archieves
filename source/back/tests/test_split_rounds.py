from datetime import date

from sqlalchemy.orm import Session

from app.db import End, Game, Round, User
from tools.split_rounds import split_oversized_rounds

RECORDED_AT = date(2026, 1, 1)


def _make_game(db_session: Session) -> Game:
    user = User(name="Yumi")
    db_session.add(user)
    db_session.flush()
    game = Game(user_id=user.id, recorded_at=RECORDED_AT)
    db_session.add(game)
    db_session.flush()
    return game


def _make_round_with_ends(
    db_session: Session, game: Game, *, number: int, round_size: int | None, num_ends: int
) -> Round:
    round_ = Round(
        game_id=game.id,
        user_id=game.user_id,
        number=number,
        recorded_at=RECORDED_AT,
        end_size=3,
        round_size=round_size,
        distance_m=70,
        target_type="122cm",
    )
    db_session.add(round_)
    db_session.flush()
    for i in range(1, num_ends + 1):
        db_session.add(
            End(round_id=round_.id, user_id=round_.user_id, number=i, recorded_at=RECORDED_AT)
        )
    db_session.flush()
    return round_


def _ends_for(db_session: Session, round_id: int) -> list[End]:
    return (
        db_session.query(End)
        .filter(End.round_id == round_id)
        .order_by(End.number)
        .all()
    )


def test_split_round_exceeding_round_size(db_session: Session) -> None:
    game = _make_game(db_session)

    oversized = _make_round_with_ends(
        db_session, game, number=1, round_size=6, num_ends=13
    )
    trailing = _make_round_with_ends(
        db_session, game, number=2, round_size=None, num_ends=1
    )

    split_count = split_oversized_rounds(db_session)
    db_session.commit()

    assert split_count == 1

    rounds = (
        db_session.query(Round).filter(Round.game_id == game.id).order_by(Round.number).all()
    )
    assert [r.number for r in rounds] == [1, 2, 3, 4]

    end_counts = [len(_ends_for(db_session, r.id)) for r in rounds]
    assert end_counts == [6, 6, 1, 1]

    for r in rounds[:3]:
        assert r.distance_m == oversized.distance_m
        assert r.end_size == oversized.end_size
        assert r.round_size == 6
        assert [e.number for e in _ends_for(db_session, r.id)] == list(
            range(1, len(_ends_for(db_session, r.id)) + 1)
        )

    # the untouched round after the split one keeps its own end and shifts number
    assert rounds[3].id == trailing.id
    assert rounds[3].round_size is None


def test_round_within_round_size_is_untouched(db_session: Session) -> None:
    game = _make_game(db_session)

    round_ = _make_round_with_ends(db_session, game, number=1, round_size=6, num_ends=6)

    split_count = split_oversized_rounds(db_session)
    db_session.commit()

    assert split_count == 0
    rounds = db_session.query(Round).filter(Round.game_id == game.id).all()
    assert len(rounds) == 1
    assert rounds[0].id == round_.id
    assert len(_ends_for(db_session, round_.id)) == 6


def test_round_without_round_size_is_untouched_within_default(db_session: Session) -> None:
    game = _make_game(db_session)

    _make_round_with_ends(db_session, game, number=1, round_size=None, num_ends=6)

    split_count = split_oversized_rounds(db_session)
    db_session.commit()

    assert split_count == 0
    assert db_session.query(Round).filter(Round.game_id == game.id).count() == 1


def test_round_without_round_size_splits_at_default(db_session: Session) -> None:
    game = _make_game(db_session)

    _make_round_with_ends(db_session, game, number=1, round_size=None, num_ends=13)

    split_count = split_oversized_rounds(db_session)
    db_session.commit()

    assert split_count == 1
    rounds = (
        db_session.query(Round).filter(Round.game_id == game.id).order_by(Round.number).all()
    )
    assert [r.number for r in rounds] == [1, 2, 3]
    end_counts = [len(_ends_for(db_session, r.id)) for r in rounds]
    assert end_counts == [6, 6, 1]
    for r in rounds:
        assert r.round_size is None
