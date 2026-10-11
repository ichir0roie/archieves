import sqlite3
from datetime import UTC, date, datetime

from fastapi.testclient import TestClient

PATH = "/api/v1/export/records.db"
SHOT_AT = datetime(2026, 5, 1, 0, 1, tzinfo=UTC)


def _open(response, tmp_path) -> sqlite3.Connection:
    path = tmp_path / "export.db"
    path.write_bytes(response.content)
    return sqlite3.connect(path)


def _my_game(factories, user):
    game = factories.GameFactory(user=user, recorded_at=date(2026, 5, 1), bow_type="recurve")
    factories.GameCommentFactory(game=game, body="風が強い")
    round_ = factories.RoundFactory(game=game, number=1, distance_m=70, target_type="122cm")
    end = factories.EndFactory(round=round_, number=1)
    factories.PointFactory(
        end=end, number=1, score=11, x=0.5, y=0.5, x_cm=0.0, y_cm=0.0, shot_at=SHOT_AT
    )
    factories.PointFactory(end=end, number=2, score=0, x=0, y=0, x_cm=None, y_cm=None)
    return game


def test_exports_my_records_as_sqlite(
    client: TestClient, current_user, factories, tmp_path
) -> None:
    _my_game(factories, current_user)

    response = client.get(PATH)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/vnd.sqlite3"
    assert 'filename="archieves-records-' in response.headers["content-disposition"]
    conn = _open(response, tmp_path)
    games = conn.execute("SELECT recorded_at, bow_type FROM games").fetchall()
    assert games == [("2026-05-01", "recurve")]
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "matches" not in tables
    assert conn.execute("SELECT body FROM game_comments").fetchall() == [("風が強い",)]
    assert conn.execute("SELECT distance_m, target_type FROM rounds").fetchall() == [(70, "122cm")]
    points = conn.execute("SELECT number, score, shot_at FROM points ORDER BY number").fetchall()
    assert points == [(1, 11, "2026-05-01T00:01:00+00:00"), (2, 0, None)]
    # 表どうしが id で繋がる
    assert conn.execute(
        "SELECT count(*) FROM points p JOIN ends e ON e.id = p.end_id "
        "JOIN rounds r ON r.id = e.round_id JOIN games g ON g.id = r.game_id"
    ).fetchone() == (2,)


def test_export_describes_its_tables_and_units(client: TestClient, current_user, tmp_path) -> None:
    conn = _open(client.get(PATH), tmp_path)

    about = dict(conn.execute("SELECT key, value FROM _about").fetchall())
    assert about["format"] == "archieves-export"
    assert about["format_version"] == "2"
    assert "relations" in about
    assert conn.execute(
        "SELECT unit FROM _columns WHERE table_name = 'rounds' AND column_name = 'distance_m'"
    ).fetchone() == ("m",)
    # 説明の無い列が無い
    tables = [
        r[0]
        for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        if not r[0].startswith("_")
    ]
    for table in tables:
        for column in conn.execute(f"PRAGMA table_info({table})"):
            assert conn.execute(
                "SELECT description FROM _columns WHERE table_name = ? AND column_name = ?",
                (table, column[1]),
            ).fetchone(), (table, column[1])
    # CREATE 文にも説明がコメントで残る
    sql = conn.execute("SELECT sql FROM sqlite_master WHERE name = 'points'").fetchone()[0]
    assert "-- 矢 1 本の結果" in sql
    assert "-- 当たったリング" in sql


def test_export_leaves_out_other_users_and_deleted_games(
    client: TestClient, current_user, factories, tmp_path
) -> None:
    factories.PointFactory()
    deleted = factories.GameFactory(user=current_user, deleted_at=date(2026, 1, 1))
    factories.PointFactory(end=factories.EndFactory(round=factories.RoundFactory(game=deleted)))

    conn = _open(client.get(PATH), tmp_path)

    for table in ["games", "rounds", "ends", "points"]:
        assert conn.execute(f"SELECT count(*) FROM {table}").fetchone() == (0,), table


def test_exported_file_can_be_imported_again(client: TestClient, current_user, factories) -> None:
    _my_game(factories, current_user)
    exported = client.get(PATH).content

    res = client.post(
        "/api/v1/import",
        data={"source": "archieves"},
        files={"file": ("archieves-records.db", exported, "application/vnd.sqlite3")},
    )

    assert res.status_code == 201
    assert res.json() == {"games": 1, "rounds": 1, "ends": 1, "points": 2}
    games = client.get(f"/api/v1/games?user_id={current_user.id}").json()
    assert len(games) == 2
    imported = max(games, key=lambda g: g["id"])
    assert client.get(f"/api/v1/games/{imported['id']}/comments").status_code == 200
    rounds = client.get(f"/api/v1/games/{imported['id']}/rounds").json()
    ends = client.get(f"/api/v1/rounds/{rounds[0]['id']}/ends").json()
    points = client.get(f"/api/v1/ends/{ends[0]['id']}/points").json()
    got = sorted((p["number"], p["score"], p["x_cm"], p["shot_at"]) for p in points)
    assert got == [(1, 11, 0.0, "2026-05-01T00:01:00Z"), (2, 0, None, None)]


def test_a_version_1_file_without_shot_at_still_imports(
    client: TestClient, current_user, factories, tmp_path
) -> None:
    _my_game(factories, current_user)
    path = tmp_path / "v1.db"
    path.write_bytes(client.get(PATH).content)
    # 矢の時刻を持つ前(形の版 1)のファイルには shot_at の列が無い
    with sqlite3.connect(path) as conn:
        conn.execute("ALTER TABLE points DROP COLUMN shot_at")
        conn.execute("UPDATE _about SET value = '1' WHERE key = 'format_version'")

    res = client.post(
        "/api/v1/import",
        data={"source": "archieves"},
        files={"file": ("archieves-records.db", path.read_bytes(), "application/vnd.sqlite3")},
    )

    assert res.status_code == 201
    assert res.json()["points"] == 2


def test_a_file_exported_while_matches_existed_still_imports(
    client: TestClient, current_user, factories, tmp_path
) -> None:
    _my_game(factories, current_user)
    path = tmp_path / "old.db"
    path.write_bytes(client.get(PATH).content)
    # 大会の情報を持っていた頃のファイルには matches の表がある
    with sqlite3.connect(path) as conn:
        conn.execute(
            "CREATE TABLE matches (id INTEGER PRIMARY KEY, game_id INTEGER, name TEXT, link TEXT)"
        )
        conn.execute("INSERT INTO matches VALUES (1, 1, '全日本選手権', NULL)")

    res = client.post(
        "/api/v1/import",
        data={"source": "archieves"},
        files={"file": ("archieves-records.db", path.read_bytes(), "application/vnd.sqlite3")},
    )

    assert res.status_code == 201
    assert res.json()["games"] == 1


def test_import_rejects_a_sqlite_file_that_is_not_an_archieves_export(
    client: TestClient, tmp_path
) -> None:
    path = tmp_path / "other.db"
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE games (id INTEGER)")

    res = client.post(
        "/api/v1/import",
        data={"source": "archieves"},
        files={"file": ("other.db", path.read_bytes(), "application/octet-stream")},
    )

    assert res.status_code == 400


def test_export_without_a_registered_user_is_not_found(unregistered_client: TestClient) -> None:
    assert unregistered_client.get(PATH).status_code == 404
