import sqlite3
import tempfile

import pandas as pd
from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.api import deps
from app.core.errors import NotFoundError
from app.crud import user as user_crud
from app.schemas.imports import ImportResult
from app.services.legacy_import import (
    REQUIRED_TABLES,
    import_legacy_backup,
)

router = APIRouter()

ALLOWED_SUFFIXES = (".sqlite", ".sqlite3", ".db")


@router.post("/import/sqlite-backup", response_model=ImportResult, status_code=201)
def import_sqlite_backup(
    file: UploadFile = File(...),
    current_user: deps.Claims = Depends(deps.get_current_user),
    s: Session = Depends(deps.get_session),
) -> ImportResult:
    """Import the legacy client app's local SQLite backup, attributed to the signed-in user."""
    user = user_crud.get_user_by_sub(s, current_user.sub)
    if user is None:
        raise NotFoundError("User not found")

    filename = file.filename or ""
    if not filename.lower().endswith(ALLOWED_SUFFIXES):
        raise ValueError("Upload a SQLite backup file (.sqlite/.sqlite3/.db)")

    with tempfile.NamedTemporaryFile(suffix=".sqlite") as tmp:
        tmp.write(file.file.read())
        tmp.flush()

        try:
            with sqlite3.connect(f"file:{tmp.name}?mode=ro", uri=True) as conn:
                tables = {
                    row[0]
                    for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
                }
                missing = [t for t in REQUIRED_TABLES if t not in tables]
                if missing:
                    raise ValueError(f"Backup is missing expected table(s): {', '.join(missing)}")
                training = pd.read_sql_query("SELECT * FROM training", conn)
                rounds = pd.read_sql_query("SELECT * FROM round", conn)
                ends = pd.read_sql_query("SELECT * FROM end", conn)
                shots = pd.read_sql_query("SELECT * FROM shot", conn)
        except sqlite3.DatabaseError as exc:
            raise ValueError("Not a valid SQLite file") from exc

    summary = import_legacy_backup(
        s, training=training, rounds=rounds, ends=ends, shots=shots, user_id=user.id
    )
    s.commit()

    return ImportResult(
        games=summary.games, rounds=summary.rounds, ends=summary.ends, points=summary.points
    )
