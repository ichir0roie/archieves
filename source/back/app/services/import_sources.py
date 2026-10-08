"""エクスポートファイルの種類ごとに、読み取りと取り込みを切り替える。

種類を足すときは、`ImportSource` に値を足し、`IMPORTERS` に読み取りの処理を登録する。
"""

from __future__ import annotations

import sqlite3
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import BinaryIO

import pandas as pd
from sqlalchemy.orm import Session

from app.services.archieves_export import import_sqlite
from app.services.legacy_import import (
    REQUIRED_TABLES,
    ImportSummary,
    import_legacy_backup,
)


class ImportSource(StrEnum):
    ANDROID_MYTARGETS = "android_mytargets"
    ARCHIEVES = "archieves"


@dataclass(frozen=True)
class Importer:
    allowed_suffixes: tuple[str, ...]
    run: Callable[[Session, BinaryIO, int], ImportSummary]


def _import_android_mytargets(s: Session, file: BinaryIO, user_id: int) -> ImportSummary:
    # sqlite3 はファイルのパスからしか開けないので、一時ファイルに書き出す
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as tmp:
        tmp.write(file.read())
        tmp.flush()

        try:
            with sqlite3.connect(f"file:{tmp.name}?mode=ro", uri=True) as conn:
                # MyTargets(Room)の表は `Training` のように大文字で始まる。SQLite の表名は
                # 大文字小文字を区別しないので、揃えて比べる
                tables = {
                    row[0].lower()
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

    return import_legacy_backup(
        s,
        training=training,
        rounds=rounds,
        ends=ends,
        shots=shots,
        user_id=user_id,
    )


def _import_archieves(s: Session, file: BinaryIO, user_id: int) -> ImportSummary:
    with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
        tmp.write(file.read())
        tmp.flush()

        try:
            with sqlite3.connect(f"file:{tmp.name}?mode=ro", uri=True) as conn:
                return import_sqlite(s, conn, user_id)
        except sqlite3.DatabaseError as exc:
            raise ValueError("Not a valid SQLite file") from exc


IMPORTERS: dict[ImportSource, Importer] = {
    ImportSource.ANDROID_MYTARGETS: Importer(
        allowed_suffixes=(
            ".sqlite",
            ".sqlite3",
            ".db",
        ),
        run=_import_android_mytargets,
    ),
    ImportSource.ARCHIEVES: Importer(
        allowed_suffixes=(
            ".db",
            ".sqlite",
            ".sqlite3",
        ),
        run=_import_archieves,
    ),
}


def import_file(
    s: Session,
    source: ImportSource,
    filename: str,
    file: BinaryIO,
    user_id: int,
) -> ImportSummary:
    importer = IMPORTERS[source]
    if not filename.lower().endswith(importer.allowed_suffixes):
        raise ValueError(
            f"Upload a {source.value} export file ({'/'.join(importer.allowed_suffixes)})"
        )
    return importer.run(s, file, user_id)
