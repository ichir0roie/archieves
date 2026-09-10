import sqlite3

from fastapi.testclient import TestClient


def _build_legacy_backup(path: str) -> None:
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE training (id INTEGER, date TEXT);
        CREATE TABLE round (
            id INTEGER, trainingId INTEGER, "index" INTEGER,
            shotsPerEnd INTEGER, maxEndCount INTEGER, distance TEXT
        );
        CREATE TABLE end (id INTEGER, roundId INTEGER, "index" INTEGER);
        CREATE TABLE shot (
            id INTEGER, endId INTEGER, "index" INTEGER, scoringRing INTEGER, x REAL, y REAL
        );

        INSERT INTO training VALUES (1, '2026-01-01');
        INSERT INTO round VALUES (10, 1, 1, 3, 6, '30m');
        INSERT INTO end VALUES (100, 10, 1);
        INSERT INTO shot VALUES (1000, 100, 1, 9, 1.5, -2.5);
        INSERT INTO shot VALUES (1001, 100, 2, 10, 0.0, 0.0);
        """
    )
    conn.commit()
    conn.close()


def _register_current_user(client: TestClient) -> dict:
    res = client.post("/api/v1/users/me/ensure", json={"name": "Yumi"})
    assert res.status_code == 200
    return res.json()


def test_import_sqlite_backup(client: TestClient, tmp_path) -> None:
    user = _register_current_user(client)

    backup_path = tmp_path / "backup.sqlite"
    _build_legacy_backup(str(backup_path))

    with open(backup_path, "rb") as f:
        res = client.post(
            "/api/v1/import/sqlite-backup",
            files={"file": ("backup.sqlite", f, "application/octet-stream")},
        )
    assert res.status_code == 201
    body = res.json()
    assert body == {"games": 1, "rounds": 1, "ends": 1, "points": 2}

    games_res = client.get(f"/api/v1/games?user_id={user['id']}")
    assert games_res.status_code == 200
    games = games_res.json()
    assert len(games) == 1
    assert games[0]["user_id"] == user["id"]

    rounds_res = client.get(f"/api/v1/games/{games[0]['id']}/rounds")
    assert rounds_res.status_code == 200
    rounds = rounds_res.json()
    assert len(rounds) == 1
    assert rounds[0]["user_id"] == user["id"]
    assert rounds[0]["distance_m"] == 30

    ends_res = client.get(f"/api/v1/rounds/{rounds[0]['id']}/ends")
    assert ends_res.status_code == 200
    ends = ends_res.json()
    assert len(ends) == 1
    assert ends[0]["user_id"] == user["id"]

    points_res = client.get(f"/api/v1/ends/{ends[0]['id']}/points")
    assert points_res.status_code == 200
    points = points_res.json()
    assert len(points) == 2
    assert {p["score"] for p in points} == {2, 1}
    assert all(p["user_id"] == user["id"] for p in points)


def test_import_without_registered_user_returns_404(client: TestClient, tmp_path) -> None:
    backup_path = tmp_path / "backup.sqlite"
    _build_legacy_backup(str(backup_path))

    with open(backup_path, "rb") as f:
        res = client.post(
            "/api/v1/import/sqlite-backup",
            files={"file": ("backup.sqlite", f, "application/octet-stream")},
        )
    assert res.status_code == 404


def test_import_rejects_non_sqlite_filename(client: TestClient) -> None:
    _register_current_user(client)

    res = client.post(
        "/api/v1/import/sqlite-backup",
        files={"file": ("backup.csv", b"not sqlite", "text/csv")},
    )
    assert res.status_code == 400


def test_import_rejects_sqlite_file_missing_tables(client: TestClient, tmp_path) -> None:
    _register_current_user(client)

    backup_path = tmp_path / "backup.sqlite"
    conn = sqlite3.connect(str(backup_path))
    conn.execute("CREATE TABLE training (id INTEGER, date TEXT)")
    conn.commit()
    conn.close()

    with open(backup_path, "rb") as f:
        res = client.post(
            "/api/v1/import/sqlite-backup",
            files={"file": ("backup.sqlite", f, "application/octet-stream")},
        )
    assert res.status_code == 400
