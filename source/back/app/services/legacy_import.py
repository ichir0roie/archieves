from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

import pandas as pd
from sqlalchemy.orm import Session

from app.db import End, Game, Point, Round

# The legacy client app's local SQLite backup carries one table per entity,
# named after its JS model classes rather than these ones.
REQUIRED_TABLES = ("training", "round", "end", "shot")


class LegacyImportError(ValueError):
    """Raised when the uploaded legacy backup data can't be parsed or imported."""


@dataclass(frozen=True)
class ImportSummary:
    games: int
    rounds: int
    ends: int
    points: int


def _parse_distance_m(raw: object) -> int:
    # Legacy distance values look like "30m" - keep just the leading digits.
    match = re.match(r"\d+", str(raw))
    if not match:
        raise LegacyImportError(f"Cannot parse a distance in meters from {raw!r}")
    return int(match.group())


def _calc_point_from_scoring_ring(scoring_ring: int) -> int:
    if scoring_ring < 0:
        return scoring_ring
    return 11 - scoring_ring


def _insert_games(db: Session, training: pd.DataFrame, user_id: int) -> dict[str, Game]:
    games = []
    old_ids = []
    try:
        for row in training.to_dict("records"):
            training_date = datetime.strptime(str(row["date"]), "%Y-%m-%d").date()
            games.append(Game(recorded_at=training_date, user_id=user_id))
            old_ids.append(str(row["id"]))
    except (KeyError, ValueError) as exc:
        raise LegacyImportError(f"Malformed row in 'training' table: {exc}") from exc
    db.add_all(games)
    db.flush()
    return dict(zip(old_ids, games, strict=True))


def _insert_rounds(
    db: Session, rounds: pd.DataFrame, game_by_training_id: dict[str, Game]
) -> dict[str, Round]:
    round_objs = []
    old_ids = []
    try:
        for row in rounds.to_dict("records"):
            game = game_by_training_id[str(row["trainingId"])]
            round_size = row["maxEndCount"]
            round_objs.append(
                Round(
                    game_id=game.id,
                    user_id=game.user_id,
                    number=int(row["index"]),
                    recorded_at=game.recorded_at,
                    end_size=int(row["shotsPerEnd"]),
                    round_size=None if pd.isna(round_size) else int(round_size),
                    distance_m=_parse_distance_m(row["distance"]),
                    target_type="unknown",
                )
            )
            old_ids.append(str(row["id"]))
    except KeyError as exc:
        raise LegacyImportError(f"Malformed row in 'round' table: {exc}") from exc
    db.add_all(round_objs)
    db.flush()
    return dict(zip(old_ids, round_objs, strict=True))


def _insert_ends(
    db: Session, ends: pd.DataFrame, round_by_old_id: dict[str, Round]
) -> dict[str, End]:
    end_objs = []
    old_ids = []
    try:
        for row in ends.to_dict("records"):
            round_ = round_by_old_id[str(row["roundId"])]
            end_objs.append(
                End(
                    round_id=round_.id,
                    user_id=round_.user_id,
                    number=int(row["index"]),
                    recorded_at=round_.recorded_at,
                )
            )
            old_ids.append(str(row["id"]))
    except KeyError as exc:
        raise LegacyImportError(f"Malformed row in 'end' table: {exc}") from exc
    db.add_all(end_objs)
    db.flush()
    return dict(zip(old_ids, end_objs, strict=True))


def _insert_points(
    db: Session, shots: pd.DataFrame, end_by_old_id: dict[str, End]
) -> list[Point]:
    point_objs = []
    try:
        for row in shots.to_dict("records"):
            end = end_by_old_id[str(row["endId"])]
            point_objs.append(
                Point(
                    end_id=end.id,
                    user_id=end.user_id,
                    number=int(row["index"]),
                    score=_calc_point_from_scoring_ring(row["scoringRing"]),
                    x=float(row["x"]),
                    y=float(row["y"]),
                    recorded_at=end.recorded_at,
                )
            )
    except KeyError as exc:
        raise LegacyImportError(f"Malformed row in 'shot' table: {exc}") from exc
    db.add_all(point_objs)
    return point_objs


def import_legacy_backup(
    db: Session,
    *,
    training: pd.DataFrame,
    rounds: pd.DataFrame,
    ends: pd.DataFrame,
    shots: pd.DataFrame,
    user_id: int,
) -> ImportSummary:
    """Import the legacy client app's backup tables, attributing every row to `user_id`."""
    game_by_training_id = _insert_games(db, training, user_id)
    round_by_old_id = _insert_rounds(db, rounds, game_by_training_id)
    end_by_old_id = _insert_ends(db, ends, round_by_old_id)
    point_objs = _insert_points(db, shots, end_by_old_id)
    db.commit()

    return ImportSummary(
        games=len(game_by_training_id),
        rounds=len(round_by_old_id),
        ends=len(end_by_old_id),
        points=len(point_objs),
    )
