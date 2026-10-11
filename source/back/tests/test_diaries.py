from datetime import UTC, date, datetime, timedelta

from fastapi.testclient import TestClient

from app.core.diary import MAX_DIARY_LENGTH
from app.core.timezone import JST


def test_create_diary_returns_the_written_row(client: TestClient, current_user) -> None:
    response = client.post("/api/v1/diaries", json={"body": "今日は風が強かった\n2 行目"})

    assert response.status_code == 201
    body = response.json()
    assert body["user_id"] == current_user.id
    assert body["body"] == "今日は風が強かった\n2 行目"
    assert body["created_at"] is not None


def test_create_diary_rejects_empty_and_too_long_bodies(client: TestClient) -> None:
    assert client.post("/api/v1/diaries", json={"body": ""}).status_code == 422
    assert client.post("/api/v1/diaries", json={}).status_code == 422
    too_long = "a" * (MAX_DIARY_LENGTH + 1)
    assert client.post("/api/v1/diaries", json={"body": too_long}).status_code == 422


def test_create_diary_accepts_the_longest_body(client: TestClient) -> None:
    longest = "a" * MAX_DIARY_LENGTH

    assert client.post("/api/v1/diaries", json={"body": longest}).status_code == 201


def test_diaries_need_a_registered_user(unregistered_client: TestClient) -> None:
    assert unregistered_client.post("/api/v1/diaries", json={"body": "x"}).status_code == 404
    assert unregistered_client.get("/api/v1/diaries").status_code == 404


def test_list_diaries_returns_newest_first_without_deleted_ones(
    client: TestClient, current_user, factories
) -> None:
    older = factories.DiaryFactory(user=current_user)
    newer = factories.DiaryFactory(user=current_user)
    factories.DiaryFactory(user=current_user, deleted_at=date(2026, 1, 1))

    response = client.get("/api/v1/diaries")

    assert response.status_code == 200
    # 同じトランザクションの中では created_at が同じなので、id で並ぶ
    assert [r["id"] for r in response.json()] == [newer.id, older.id]


def test_list_diaries_is_empty_at_first(client: TestClient) -> None:
    response = client.get("/api/v1/diaries")

    assert response.status_code == 200
    assert response.json() == []


def _at(year: int, month: int, day: int, hour: int = 12) -> datetime:
    return datetime(year, month, day, hour, tzinfo=JST)


def test_list_diaries_limit_returns_the_newest_ones(
    client: TestClient, current_user, factories
) -> None:
    diaries = [
        factories.DiaryFactory(user=current_user, created_at=_at(2026, 1, day))
        for day in range(1, 13)
    ]

    response = client.get("/api/v1/diaries", params={"limit": 10})

    assert response.status_code == 200
    assert [r["id"] for r in response.json()] == [d.id for d in reversed(diaries)][:10]


def test_list_diaries_rejects_a_limit_below_one(client: TestClient) -> None:
    assert client.get("/api/v1/diaries", params={"limit": 0}).status_code == 422


def test_list_diaries_of_a_year_cuts_the_year_in_jst(
    client: TestClient, current_user, factories
) -> None:
    # 日本時間の 1 月 1 日 0 時ちょうどは新しい年、その直前は前の年
    first = factories.DiaryFactory(user=current_user, created_at=_at(2026, 1, 1, hour=0))
    factories.DiaryFactory(
        user=current_user, created_at=_at(2026, 1, 1, hour=0) - timedelta(seconds=1)
    )
    factories.DiaryFactory(user=current_user, created_at=_at(2027, 1, 1, hour=0))
    last = factories.DiaryFactory(
        user=current_user, created_at=_at(2027, 1, 1, hour=0) - timedelta(seconds=1)
    )

    response = client.get("/api/v1/diaries", params={"year": 2026})

    assert response.status_code == 200
    assert [r["id"] for r in response.json()] == [last.id, first.id]


def test_list_diary_years_returns_years_in_jst_newest_first(
    client: TestClient, current_user, factories
) -> None:
    # UTC では 2024 年の暮れ、日本時間では 2025 年
    factories.DiaryFactory(user=current_user, created_at=datetime(2024, 12, 31, 16, tzinfo=UTC))
    factories.DiaryFactory(user=current_user, created_at=_at(2026, 5, 1))
    factories.DiaryFactory(user=current_user, created_at=_at(2026, 6, 1))
    factories.DiaryFactory(
        user=current_user,
        created_at=_at(2023, 1, 1),
        deleted_at=date(2026, 1, 1),
    )
    factories.DiaryFactory(created_at=_at(2022, 1, 1))

    response = client.get("/api/v1/diaries/years")

    assert response.status_code == 200
    assert response.json() == [2026, 2025]


def test_list_diary_years_is_empty_at_first(client: TestClient) -> None:
    assert client.get("/api/v1/diaries/years").json() == []
