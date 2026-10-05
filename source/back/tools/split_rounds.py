"""Split existing Round rows whose End count exceeds their round_size.

Legacy/imported data can end up with a single Round holding more ends than
its own round_size allows (e.g. a recording bug, or ends imported without
enforcing the limit). This splits each such Round into consecutive Rounds of
at most round_size ends, inserting the extra Rounds right after the
original and shifting the numbers of every later Round in the same Game.
Rounds with no round_size are split at DEFAULT_ROUND_SIZE ends instead.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db import End, Round
from app.db.session import SessionLocal

DEFAULT_ROUND_SIZE = 6


def _split_round(s: Session, round_: Round, ends: list[End], chunk_size: int) -> int:
    chunks = [ends[i : i + chunk_size] for i in range(0, len(ends), chunk_size)]

    for number, end in enumerate(chunks[0], start=1):
        end.number = number

    for offset, chunk in enumerate(chunks[1:], start=1):
        new_round = Round(
            game_id=round_.game_id,
            user_id=round_.user_id,
            number=round_.number + offset,
            recorded_at=chunk[0].recorded_at,
            end_size=round_.end_size,
            round_size=round_.round_size,
            distance_m=round_.distance_m,
            target_type=round_.target_type,
        )
        s.add(new_round)
        s.flush()
        for number, end in enumerate(chunk, start=1):
            end.round_id = new_round.id
            end.number = number

    return len(chunks) - 1


def _split_rounds_for_game(s: Session, game_id: int) -> int:
    rounds = s.query(Round).filter(Round.game_id == game_id).order_by(Round.number).all()

    split_count = 0
    number_offset = 0
    for round_ in rounds:
        round_.number += number_offset
        chunk_size = round_.round_size if round_.round_size is not None else DEFAULT_ROUND_SIZE

        ends = (
            s.query(End)
            .filter(End.round_id == round_.id)
            .order_by(End.number)
            .all()
        )
        if len(ends) <= chunk_size:
            continue

        number_offset += _split_round(s, round_, ends, chunk_size)
        split_count += 1

    return split_count


def split_oversized_rounds(s: Session) -> int:
    game_ids = [row[0] for row in s.query(Round.game_id).distinct()]

    split_count = 0
    for game_id in game_ids:
        split_count += _split_rounds_for_game(s, game_id)
    return split_count


def main() -> None:
    with SessionLocal() as s:
        split_count = split_oversized_rounds(s)
        s.commit()

    print(f"split {split_count} round(s) exceeding round_size")


if __name__ == "__main__":
    main()
