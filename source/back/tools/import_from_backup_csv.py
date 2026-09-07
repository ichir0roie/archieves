

from __future__ import annotations
from mods.factory_db import *
from app.db import *

import pandas as pd
from sqlalchemy.orm import Session

from app.services.legacy_import import import_legacy_backup
from debug.db.create_db import recreate_db
from debug.db.setup import setup_debug_user


def import_backup(s: Session, user_id: int) -> None:
    training = pd.read_csv(".data/backup/training.csv")
    rounds = pd.read_csv(".data/backup/round.csv")
    ends = pd.read_csv(".data/backup/end.csv")
    shots = pd.read_csv(".data/backup/shot.csv")

    summary = import_legacy_backup(
        s, training=training, rounds=rounds, ends=ends, shots=shots, user_id=user_id
    )

    print(
        f"imported {summary.games} games, {summary.rounds} rounds, "
        f"{summary.ends} ends, {summary.points} points"
    )


def main() -> None:

    recreate_db()
    s = FactorySession()

    debug_user = setup_debug_user.create_debug_user()
    import_backup(s, debug_user.id)


if __name__ == "__main__":
    main()
