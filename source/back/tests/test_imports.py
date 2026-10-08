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


def test_import_android_mytargets_backup(client: TestClient, tmp_path) -> None:
    user = _register_current_user(client)

    backup_path = tmp_path / "backup.sqlite"
    _build_legacy_backup(str(backup_path))

    with open(backup_path, "rb") as f:
        res = client.post(
            "/api/v1/import",
            data={"source": "android_mytargets"},
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


def test_import_without_registered_user_returns_404(
    unregistered_client: TestClient, tmp_path
) -> None:
    backup_path = tmp_path / "backup.sqlite"
    _build_legacy_backup(str(backup_path))

    with open(backup_path, "rb") as f:
        res = unregistered_client.post(
            "/api/v1/import",
            data={"source": "android_mytargets"},
            files={"file": ("backup.sqlite", f, "application/octet-stream")},
        )
    assert res.status_code == 404


def test_import_rejects_non_sqlite_filename(client: TestClient) -> None:
    _register_current_user(client)

    res = client.post(
        "/api/v1/import",
        data={"source": "android_mytargets"},
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
            "/api/v1/import",
            data={"source": "android_mytargets"},
            files={"file": ("backup.sqlite", f, "application/octet-stream")},
        )
    assert res.status_code == 400


def test_import_rejects_a_file_that_is_not_sqlite(client: TestClient) -> None:
    _register_current_user(client)

    res = client.post(
        "/api/v1/import",
        data={"source": "android_mytargets"},
        files={"file": ("backup.sqlite", b"definitely not a database", "application/octet-stream")},
    )
    assert res.status_code == 400
    assert res.json()["detail"] == "Not a valid SQLite file"


def test_import_rejects_a_backup_with_malformed_rows(client: TestClient, tmp_path) -> None:
    _register_current_user(client)

    backup_path = tmp_path / "backup.sqlite"
    _build_legacy_backup(str(backup_path))
    conn = sqlite3.connect(str(backup_path))
    conn.execute("UPDATE training SET date = 'not-a-date'")
    conn.commit()
    conn.close()

    with open(backup_path, "rb") as f:
        res = client.post(
            "/api/v1/import",
            data={"source": "android_mytargets"},
            files={"file": ("backup.sqlite", f, "application/octet-stream")},
        )
    assert res.status_code == 400
    assert "'training' table" in res.json()["detail"]


def test_import_keeps_no_partial_rows_when_a_later_table_is_malformed(
    client: TestClient, tmp_path
) -> None:
    user = _register_current_user(client)

    backup_path = tmp_path / "backup.sqlite"
    _build_legacy_backup(str(backup_path))
    conn = sqlite3.connect(str(backup_path))
    conn.execute("UPDATE shot SET endId = 999")
    conn.commit()
    conn.close()

    with open(backup_path, "rb") as f:
        res = client.post(
            "/api/v1/import",
            data={"source": "android_mytargets"},
            files={"file": ("backup.sqlite", f, "application/octet-stream")},
        )
    assert res.status_code == 400

    games = client.get(f"/api/v1/games?user_id={user['id']}")
    assert games.json() == []


def test_points_imported_onto_a_legacy_target_face_have_no_centimeter_position(
    client: TestClient, tmp_path
) -> None:
    user = _register_current_user(client)

    backup_path = tmp_path / "backup.sqlite"
    _build_legacy_backup(str(backup_path))
    with open(backup_path, "rb") as f:
        assert (
            client.post(
                "/api/v1/import",
            data={"source": "android_mytargets"},
                files={"file": ("backup.sqlite", f, "application/octet-stream")},
            ).status_code
            == 201
        )

    game = client.get(f"/api/v1/games?user_id={user['id']}").json()[0]
    round_ = client.get(f"/api/v1/games/{game['id']}/rounds").json()[0]
    end = client.get(f"/api/v1/rounds/{round_['id']}/ends").json()[0]

    assert round_["target_type"] == "unknown"
    assert all(p["x_cm"] is None and p["y_cm"] is None for p in
               client.get(f"/api/v1/ends/{end['id']}/points").json())


def test_a_legacy_target_face_does_not_constrain_new_scores(
    client: TestClient, tmp_path
) -> None:
    user = _register_current_user(client)

    backup_path = tmp_path / "backup.sqlite"
    _build_legacy_backup(str(backup_path))
    with open(backup_path, "rb") as f:
        client.post(
            "/api/v1/import",
            data={"source": "android_mytargets"},
            files={"file": ("backup.sqlite", f, "application/octet-stream")},
        )

    game = client.get(f"/api/v1/games?user_id={user['id']}").json()[0]
    round_ = client.get(f"/api/v1/games/{game['id']}/rounds").json()[0]
    end = client.get(f"/api/v1/rounds/{round_['id']}/ends").json()[0]

    res = client.post(
        f"/api/v1/ends/{end['id']}/points",
        json={"number": 9, "score": 11, "x": 0.5, "y": 0.5, "recorded_at": "2026-01-01"},
    )
    assert res.status_code == 201
    assert res.json()["x_cm"] is None


def test_import_rejects_an_unknown_source(client: TestClient, tmp_path) -> None:
    _register_current_user(client)

    backup_path = tmp_path / "backup.sqlite"
    _build_legacy_backup(str(backup_path))
    with open(backup_path, "rb") as f:
        res = client.post(
            "/api/v1/import",
            data={"source": "unknown_app"},
            files={"file": ("backup.sqlite", f, "application/octet-stream")},
        )
    assert res.status_code == 422


def test_import_accepts_capitalized_table_names(client: TestClient, tmp_path) -> None:
    # 本物の MyTargets のバックアップは表名が大文字で始まる
    _register_current_user(client)

    backup_path = tmp_path / "backup.db"
    _build_legacy_backup(str(backup_path))
    conn = sqlite3.connect(str(backup_path))
    for name in ("training", "round", "end", "shot"):
        conn.execute(f'ALTER TABLE "{name}" RENAME TO "{name}_tmp"')
        conn.execute(f'ALTER TABLE "{name}_tmp" RENAME TO "{name.capitalize()}"')
    conn.commit()
    conn.close()

    with open(backup_path, "rb") as f:
        res = client.post(
            "/api/v1/import",
            data={"source": "android_mytargets"},
            files={"file": ("backup.db", f, "application/octet-stream")},
        )
    assert res.status_code == 201
    assert res.json() == {"games": 1, "rounds": 1, "ends": 1, "points": 2}
