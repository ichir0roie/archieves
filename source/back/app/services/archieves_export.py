"""このアプリの記録を SQLite のファイルに書き出し、また取り込む。

ファイルは他のアプリや AI がそのまま読めるよう、何がどの単位で入っていて、表どうしがどう繋がるかを
ファイルの中に持たせる(`_about`・`_columns` の表と、`sqlite_master.sql` に残る CREATE 文の
コメント)。
形を変えたら `FORMAT_VERSION` を上げ、取り込み側で古いバージョンをどう読むかを決める。
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.scoring import MAX_ARROW_DIAMETER_MM, MIN_ARROW_DIAMETER_MM
from app.core.timezone import JST
from app.crud.game import point_cm
from app.db import End, Game, Point, Round
from app.db.models.comment_model import EndComment, GameComment, RoundComment
from app.services.legacy_import import ImportSummary

FORMAT_NAME = "archieves-export"
# 1: 最初の形。2: points.shot_at・games.arrow_diameter_px を足した(1 のファイルは NULL として読む)。
# 3: games.all_in を足した(2 までのファイルは 0 として読む)。
# 4: games.backfilled を足した(3 までのファイルは 0 として読む)。
# 5: games.arrow_diameter_px を arrow_diameter_mm に替えた(4 までのファイルは NULL として読む。px は
# 端末ごとに mm との比が違うので直せない)
FORMAT_VERSION = 5


@dataclass(frozen=True)
class Column:
    name: str
    ddl: str
    unit: str
    description: str


@dataclass(frozen=True)
class Table:
    name: str
    description: str
    columns: tuple[Column, ...]
    foreign_key: tuple[str, str] | None = None


TABLES: tuple[Table, ...] = (
    Table(
        "games",
        "ゲーム。ある日に行った練習または試合の一回分。1 つ以上のラウンドから成る。",
        (
            Column(
                "id",
                "INTEGER PRIMARY KEY",
                "",
                "このファイルの中だけで通じる id",
            ),
            Column(
                "recorded_at",
                "TEXT NOT NULL",
                "日付(YYYY-MM-DD、日本時間)",
                "行った日",
            ),
            Column(
                "game_size",
                "INTEGER",
                "ラウンドの数",
                "記録を始める前に決めたラウンドの数。不明なら NULL",
            ),
            Column(
                "bow_type",
                "TEXT",
                "",
                "弓の種類(recurve・compound・barebow など、または自由入力)。不明なら NULL",
            ),
            Column(
                "arrow_diameter_mm",
                "INTEGER",
                "mm",
                "矢の直径。記入画面は的の大きさとの比で画面の px に直し(四捨五入)、その円が帯の線に"
                "かかれば高い方(オールインなら低い方)の点にした。設定する前の記録は NULL",
            ),
            Column(
                "all_in",
                "INTEGER NOT NULL DEFAULT 0",
                "0 か 1",
                "1 ならオールイン。矢が帯に完全に入らなければその帯の点にせず、"
                "線にかかれば低い方の点にした",
            ),
            Column(
                "backfilled",
                "INTEGER NOT NULL DEFAULT 0",
                "0 か 1",
                "1 ならあとから入力。日付を決めて入れたので、ラウンド・エンド・矢の日付は"
                "ゲームの日付、矢の shot_at はその日の 0 時(入れた端末の時間帯)にそろえてある",
            ),
        ),
    ),
    Table(
        "rounds",
        "ラウンド。距離と的を決めて射つ一続き。1 つ以上のエンドから成る。",
        (
            Column(
                "id",
                "INTEGER PRIMARY KEY",
                "",
                "このファイルの中だけで通じる id",
            ),
            Column(
                "game_id",
                "INTEGER NOT NULL",
                "",
                "games.id",
            ),
            Column(
                "number",
                "INTEGER NOT NULL",
                "番号(1 始まり)",
                "ゲームの中での順番",
            ),
            Column(
                "recorded_at",
                "TEXT NOT NULL",
                "日付(YYYY-MM-DD、日本時間)",
                "行った日",
            ),
            Column(
                "end_size",
                "INTEGER NOT NULL",
                "本",
                "1 エンドに射つ矢の数",
            ),
            Column(
                "round_size",
                "INTEGER",
                "エンドの数",
                "このラウンドで射つ予定のエンドの数。不明なら NULL",
            ),
            Column(
                "distance_m",
                "INTEGER NOT NULL",
                "m",
                "的までの距離",
            ),
            Column(
                "target_type",
                "TEXT NOT NULL",
                "",
                "的の種類。92cm・122cm・compound(80cm)、または '<直径>cm'",
            ),
        ),
        ("game_id", "games(id)"),
    ),
    Table(
        "ends",
        "エンド。続けて射つ数本の矢のまとまり。",
        (
            Column(
                "id",
                "INTEGER PRIMARY KEY",
                "",
                "このファイルの中だけで通じる id",
            ),
            Column(
                "round_id",
                "INTEGER NOT NULL",
                "",
                "rounds.id",
            ),
            Column(
                "number",
                "INTEGER NOT NULL",
                "番号(1 始まり)",
                "ラウンドの中での順番",
            ),
            Column(
                "recorded_at",
                "TEXT NOT NULL",
                "日付(YYYY-MM-DD、日本時間)",
                "行った日",
            ),
        ),
        ("round_id", "rounds(id)"),
    ),
    Table(
        "points",
        "矢 1 本の結果。",
        (
            Column(
                "id",
                "INTEGER PRIMARY KEY",
                "",
                "このファイルの中だけで通じる id",
            ),
            Column(
                "end_id",
                "INTEGER NOT NULL",
                "",
                "ends.id",
            ),
            Column(
                "number",
                "INTEGER NOT NULL",
                "番号(1 始まり)",
                "エンドの中での順番",
            ),
            Column(
                "score",
                "INTEGER NOT NULL",
                "リングの番号",
                "当たったリング。11 は X(10 点として数え、同点の比べにだけ使う)、"
                "0 は M(外れ、0 点)、1〜10 はその点",
            ),
            Column(
                "x",
                "REAL NOT NULL",
                "的の幅に対する割合(0〜1)",
                "当たった位置の横。的の左上が 0、右下が 1、中心が 0.5。"
                "x と y が両方 0 なら位置を記録していない",
            ),
            Column(
                "y",
                "REAL NOT NULL",
                "的の高さに対する割合(0〜1)",
                "当たった位置の縦。下が大きい。x と同じ決まり",
            ),
            Column(
                "x_cm",
                "REAL",
                "cm",
                "中心からの横のずれ(右が正)。(x - 0.5) × 的の直径。"
                "位置が無い・的の大きさが分からないときは NULL",
            ),
            Column(
                "y_cm",
                "REAL",
                "cm",
                "中心からの縦のずれ(下が正)。x_cm と同じ決まり",
            ),
            Column(
                "recorded_at",
                "TEXT NOT NULL",
                "日付(YYYY-MM-DD、日本時間)",
                "行った日",
            ),
            Column(
                "shot_at",
                "TEXT",
                "日時(ISO 8601、時差付き)",
                "矢を記録した時刻。記入画面で記録した矢だけが持ち、それより前の記録・"
                "取り込んだ記録は NULL",
            ),
        ),
        ("end_id", "ends(id)"),
    ),
    Table(
        "game_comments",
        "ゲームに付けたメモ(ゲーム 1 つに 0 か 1 行)。",
        (
            Column(
                "game_id",
                "INTEGER PRIMARY KEY",
                "",
                "games.id",
            ),
            Column(
                "body",
                "TEXT NOT NULL",
                "",
                "メモの本文",
            ),
        ),
        ("game_id", "games(id)"),
    ),
    Table(
        "round_comments",
        "ラウンドに付けたメモ(ラウンド 1 つに 0 か 1 行)。",
        (
            Column(
                "round_id",
                "INTEGER PRIMARY KEY",
                "",
                "rounds.id",
            ),
            Column(
                "body",
                "TEXT NOT NULL",
                "",
                "メモの本文",
            ),
        ),
        ("round_id", "rounds(id)"),
    ),
    Table(
        "end_comments",
        "エンドに付けたメモ(エンド 1 つに 0 か 1 行)。",
        (
            Column(
                "end_id",
                "INTEGER PRIMARY KEY",
                "",
                "ends.id",
            ),
            Column(
                "body",
                "TEXT NOT NULL",
                "",
                "メモの本文",
            ),
        ),
        ("end_id", "ends(id)"),
    ),
)

ABOUT = {
    "format": FORMAT_NAME,
    "format_version": str(FORMAT_VERSION),
    "description": (
        "アーチェリーの記録アプリ archieves から書き出した、一人の利用者の記録。"
        "表と列の説明は _columns の表にあり、"
        "各表の CREATE 文(sqlite_master.sql)にも同じ説明をコメントで書いてある。"
    ),
    "relations": (
        "games 1—n rounds(rounds.game_id)、"
        "rounds 1—n ends(ends.round_id)、"
        "ends 1—n points(points.end_id)。"
        "game_comments・round_comments・end_comments は、"
        "それぞれ games・rounds・ends に 0..1 で付く。"
    ),
    "how_to_total": (
        "ラウンドの合計点は、そのラウンドの ends に属す points の点の和。"
        "点は score が 11 なら 10、0 以下なら 0、それ以外は score。X の数は score = 11 の数。"
    ),
}


def _create_table_sql(table: Table) -> str:
    # 各列の説明を SQL のコメントにして CREATE 文に残す。sqlite_master.sql に原文のまま残るので、
    # _columns を知らない読み手でも表の形と一緒に説明を読める
    lines = [
        f"  {c.name} {c.ddl}, -- {c.description}" + (f"(単位: {c.unit})" if c.unit else "")
        for c in table.columns
    ]
    if table.foreign_key is not None:
        column, ref = table.foreign_key
        lines.append(f"  FOREIGN KEY ({column}) REFERENCES {ref}")
    else:
        # 最後の列の後ろのカンマを外す(コメントの前にある)
        lines[-1] = lines[-1].replace(", --", " --", 1)
    # 表の説明も括弧の中に置く。CREATE の前のコメントは sqlite_master.sql に残らない
    return (
        f"CREATE TABLE {table.name} ( -- {table.description}\n" + "\n".join(lines) + "\n)"
    )


def _write_schema(conn: sqlite3.Connection, exported_at: datetime) -> None:
    conn.execute(
        "CREATE TABLE _about (key TEXT PRIMARY KEY, value TEXT NOT NULL) -- このファイルの説明"
    )
    conn.executemany(
        "INSERT INTO _about VALUES (?, ?)",
        [*ABOUT.items(), ("exported_at", exported_at.isoformat())],
    )
    conn.execute(
        "CREATE TABLE _columns ("
        "table_name TEXT NOT NULL, "
        "column_name TEXT NOT NULL, "
        "unit TEXT NOT NULL, "
        "description TEXT NOT NULL, "
        "PRIMARY KEY (table_name, column_name)"
        ") -- 表と列の説明。column_name が '' の行は表そのものの説明"
    )
    for table in TABLES:
        conn.execute(_create_table_sql(table))
        conn.execute("INSERT INTO _columns VALUES (?, '', '', ?)", (table.name, table.description))
        conn.executemany(
            "INSERT INTO _columns VALUES (?, ?, ?, ?)",
            [(table.name, c.name, c.unit, c.description) for c in table.columns],
        )


def _insert(conn: sqlite3.Connection, table: str, rows) -> None:
    rows = [tuple(v.isoformat() if isinstance(v, date) else v for v in row) for row in rows]
    if not rows:
        return
    marks = ", ".join("?" * len(rows[0]))
    conn.executemany(f"INSERT INTO {table} VALUES ({marks})", rows)


def export_sqlite(s: Session, user_id: int) -> bytes:
    """本人の記録(消した game・round を除く)を SQLite のファイルにして返す。"""
    visible_games = select(Game.id).where(Game.user_id == user_id, Game.deleted_at.is_(None))
    visible_rounds = select(Round.id).where(
        Round.game_id.in_(visible_games),
        Round.deleted_at.is_(None),
    )
    visible_ends = select(End.id).where(End.round_id.in_(visible_rounds))

    queries = {
        "games": select(
            Game.id,
            Game.recorded_at,
            Game.game_size,
            Game.bow_type,
            Game.arrow_diameter_mm,
            Game.all_in,
            Game.backfilled,
        )
        .where(Game.id.in_(visible_games))
        .order_by(Game.id),
        "rounds": select(
            Round.id,
            Round.game_id,
            Round.number,
            Round.recorded_at,
            Round.end_size,
            Round.round_size,
            Round.distance_m,
            Round.target_type,
        )
        .where(Round.id.in_(visible_rounds))
        .order_by(Round.id),
        "ends": select(End.id, End.round_id, End.number, End.recorded_at)
        .where(End.id.in_(visible_ends))
        .order_by(End.id),
        "points": select(
            Point.id,
            Point.end_id,
            Point.number,
            Point.score,
            Point.x,
            Point.y,
            Point.x_cm,
            Point.y_cm,
            Point.recorded_at,
            Point.shot_at,
        )
        .where(Point.end_id.in_(visible_ends))
        .order_by(Point.id),
        "game_comments": select(GameComment.game_id, GameComment.body).where(
            GameComment.game_id.in_(visible_games)
        ),
        "round_comments": select(RoundComment.round_id, RoundComment.body).where(
            RoundComment.round_id.in_(visible_rounds)
        ),
        "end_comments": select(EndComment.end_id, EndComment.body).where(
            EndComment.end_id.in_(visible_ends)
        ),
    }

    # sqlite3 はファイルにしか書けないので、一時ファイルに書いて読み戻す
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        conn = sqlite3.connect(path)
        try:
            _write_schema(conn, datetime.now(JST))
            for table, stmt in queries.items():
                _insert(conn, table, s.execute(stmt))
            conn.commit()
        finally:
            conn.close()
        with open(path, "rb") as f:
            return f.read()
    finally:
        os.remove(path)


def export_filename(today: date) -> str:
    return f"archieves-records-{today:%Y%m%d}.db"


def _read(conn: sqlite3.Connection, table: str) -> list[sqlite3.Row]:
    return conn.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    """表の列の名前。古いバージョンのファイルに無い列を、行ごとでなく表ごとに一度だけ見分ける。"""
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def _arrow_diameter_mm(value: int | None) -> int | None:
    """ファイルの矢の直径。API で書けない値(範囲外)は、画面が扱えないので取り込まない。"""
    if value is not None and not MIN_ARROW_DIAMETER_MM <= value <= MAX_ARROW_DIAMETER_MM:
        raise ValueError(
            f"Malformed archieves export file: arrow_diameter_mm {value} is out of range"
        )
    return value


def import_sqlite(s: Session, conn: sqlite3.Connection, user_id: int) -> ImportSummary:
    """`export_sqlite` のファイルを、本人の新しい記録として足す。

    id はファイルのものを使わず振り直す。
    """
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "_about" not in tables:
        raise ValueError("Not an archieves export file")
    about = dict(conn.execute("SELECT key, value FROM _about").fetchall())
    if about.get("format") != FORMAT_NAME:
        raise ValueError("Not an archieves export file")
    if int(about.get("format_version", "0")) > FORMAT_VERSION:
        raise ValueError(f"Unsupported export format version: {about.get('format_version')}")

    conn.row_factory = sqlite3.Row
    with s.begin_nested():
        try:
            game_columns = _columns(conn, "games")
            has_arrow_diameter = "arrow_diameter_mm" in game_columns
            has_all_in = "all_in" in game_columns
            has_backfilled = "backfilled" in game_columns
            games: dict[int, Game] = {}
            for r in _read(conn, "games"):
                games[r["id"]] = Game(
                    user_id=user_id,
                    recorded_at=date.fromisoformat(r["recorded_at"]),
                    game_size=r["game_size"],
                    bow_type=r["bow_type"],
                    arrow_diameter_mm=(
                        _arrow_diameter_mm(r["arrow_diameter_mm"]) if has_arrow_diameter else None
                    ),
                    all_in=bool(r["all_in"]) if has_all_in else False,
                    backfilled=bool(r["backfilled"]) if has_backfilled else False,
                )
            s.add_all(games.values())
            s.flush()

            # 大会の情報を持っていた頃のファイルには matches の表もあるが、機能を消したので読まない
            rounds: dict[int, Round] = {}
            for r in _read(conn, "rounds"):
                rounds[r["id"]] = Round(
                    game_id=games[r["game_id"]].id,
                    user_id=user_id,
                    number=r["number"],
                    recorded_at=date.fromisoformat(r["recorded_at"]),
                    end_size=r["end_size"],
                    round_size=r["round_size"],
                    distance_m=r["distance_m"],
                    target_type=r["target_type"],
                )
            s.add_all(rounds.values())
            s.flush()

            ends: dict[int, End] = {}
            round_of_end: dict[int, Round] = {}
            for r in _read(conn, "ends"):
                round_of_end[r["id"]] = rounds[r["round_id"]]
                ends[r["id"]] = End(
                    round_id=rounds[r["round_id"]].id,
                    user_id=user_id,
                    number=r["number"],
                    recorded_at=date.fromisoformat(r["recorded_at"]),
                )
            s.add_all(ends.values())
            s.flush()

            has_shot_at = "shot_at" in _columns(conn, "points")
            points = []
            for r in _read(conn, "points"):
                shot_at = r["shot_at"] if has_shot_at else None
                # x_cm・y_cm はファイルの値を信じず、的の種類から計算し直す
                x_cm, y_cm = point_cm(round_of_end[r["end_id"]], r["x"], r["y"])
                points.append(
                    Point(
                        end_id=ends[r["end_id"]].id,
                        user_id=user_id,
                        number=r["number"],
                        score=r["score"],
                        x=r["x"],
                        y=r["y"],
                        x_cm=x_cm,
                        y_cm=y_cm,
                        recorded_at=date.fromisoformat(r["recorded_at"]),
                        shot_at=datetime.fromisoformat(shot_at) if shot_at else None,
                    )
                )
            s.add_all(points)

            s.add_all(
                GameComment(game_id=games[r["game_id"]].id, user_id=user_id, body=r["body"])
                for r in _read(conn, "game_comments")
            )
            s.add_all(
                RoundComment(round_id=rounds[r["round_id"]].id, user_id=user_id, body=r["body"])
                for r in _read(conn, "round_comments")
            )
            s.add_all(
                EndComment(end_id=ends[r["end_id"]].id, user_id=user_id, body=r["body"])
                for r in _read(conn, "end_comments")
            )
            s.flush()
        except (KeyError, IndexError, TypeError, sqlite3.DatabaseError) as exc:
            raise ValueError(f"Malformed archieves export file: {exc}") from exc

    return ImportSummary(
        games=len(games),
        rounds=len(rounds),
        ends=len(ends),
        points=len(points),
    )
