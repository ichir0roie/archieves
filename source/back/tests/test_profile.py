from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.crud import profile as profile_crud
from app.db import User


def _create_user(client: TestClient) -> dict:
    res = client.post("/api/v1/users/me/ensure", json={"name": "Yumi"})
    assert res.status_code == 200
    return res.json()


def test_get_user_profile_returns_basic_info(client: TestClient) -> None:
    user = _create_user(client)

    res = client.get(f"/api/v1/users/{user['id']}/profile")
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["id"] == user["id"]
    assert body["user"]["name"] == "Yumi"
    assert body["rounds"]["count"] == 0


def test_get_missing_user_profile_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/users/999999/profile")
    assert response.status_code == 404
    assert response.json() == {"detail": "User not found"}


def test_get_other_users_profile_is_viewable(client: TestClient, s: Session) -> None:
    _create_user(client)
    other = User(sub="someone-elses-sub", name="Kenta", profile_visibility="public")
    s.add(other)
    s.commit()

    response = client.get(f"/api/v1/users/{other.id}/profile")
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["id"] == other.id
    assert body["user"]["name"] == "Kenta"
    assert body["user"]["sub"] == "someone-elses-sub"


def test_user_profile_summarizes_the_latest_100_games(
    client: TestClient, current_user, factories, monkeypatch
) -> None:
    monkeypatch.setattr(profile_crud, "SUMMARY_GAME_COUNT", 2)
    today = date.today()
    for days_ago, score in [(1, 9), (2, 8), (3, 10)]:
        game = factories.GameFactory(
            user=current_user,
            recorded_at=today - timedelta(days=days_ago),
        )
        factories.PointFactory.create_batch(
            3,
            end=factories.EndFactory(round=factories.RoundFactory(game=game)),
            score=score,
        )
    # 消したゲームは数えない
    factories.GameFactory(user=current_user, recorded_at=today, deleted_at=datetime.now(UTC))

    body = client.get(f"/api/v1/users/{current_user.id}/profile").json()
    assert body["game_count"] == 2
    assert body["period_start"] == (today - timedelta(days=2)).isoformat()
    assert body["period_end"] == (today - timedelta(days=1)).isoformat()
    assert body["rounds"]["count"] == 2
    assert body["rounds"]["total"] == 27 + 24
    assert body["points"]["count"] == 6


def test_user_profile_without_games(client: TestClient, current_user) -> None:
    body = client.get(f"/api/v1/users/{current_user.id}/profile").json()
    assert body["game_count"] == 0
    assert body["period_start"] is None
    assert body["period_end"] is None
    assert body["recent_games"] == []
    assert body["recent_diaries"] == []


def test_user_profile_lists_the_latest_10_games_with_scores(
    client: TestClient, current_user, factories
) -> None:
    today = date.today()
    games = [
        factories.GameFactory(user=current_user, recorded_at=today - timedelta(days=days_ago))
        for days_ago in range(12)
    ]
    end = factories.EndFactory(round=factories.RoundFactory(game=games[0]))
    factories.PointFactory.create_batch(3, end=end, score=7)
    # 消したラウンドの点は足さない
    deleted_round = factories.RoundFactory(game=games[0], deleted_at=datetime.now(UTC))
    factories.PointFactory(end=factories.EndFactory(round=deleted_round), score=10)

    recent = client.get(f"/api/v1/users/{current_user.id}/profile").json()["recent_games"]
    assert [game["game_id"] for game in recent] == [game.id for game in games[:10]]
    assert recent[0] == {
        "game_id": games[0].id,
        "recorded_at": today.isoformat(),
        "arrow_count": 3,
        "total_score": 21,
    }
    assert recent[1]["arrow_count"] == 0
    assert recent[1]["total_score"] == 0


def test_user_profile_lists_the_latest_10_diaries(
    client: TestClient, current_user, factories
) -> None:
    diaries = [factories.DiaryFactory(user=current_user) for _ in range(12)]
    factories.DiaryFactory(user=current_user, deleted_at=datetime.now(UTC))

    recent = client.get(f"/api/v1/users/{current_user.id}/profile").json()["recent_diaries"]
    assert [diary["id"] for diary in recent] == [diary.id for diary in reversed(diaries[2:])]
    assert recent[0]["body"] == diaries[-1].body


@pytest.mark.parametrize(
    ("score_visibility", "diary_visibility", "same_organization", "shows_games", "shows_diaries"),
    [
        ("private", "private", True, False, False),
        ("public", "private", False, True, False),
        ("private", "public", False, False, True),
        ("organization", "organization", True, True, True),
        ("organization", "organization", False, False, False),
    ],
)
def test_other_users_scores_and_diaries_follow_their_visibility(
    client: TestClient,
    current_user,
    factories,
    score_visibility: str,
    diary_visibility: str,
    same_organization: bool,
    shows_games: bool,
    shows_diaries: bool,
) -> None:
    organization = factories.OrganizationFactory()
    current_user.organization_id = organization.id
    other = factories.UserFactory(
        sub="other-sub",
        profile_visibility="public",
        score_visibility=score_visibility,
        diary_visibility=diary_visibility,
        organization_id=(organization if same_organization else factories.OrganizationFactory()).id,
    )
    game = factories.GameFactory(user=other)
    diary = factories.DiaryFactory(user=other)

    body = client.get(f"/api/v1/users/{other.id}/profile").json()
    if shows_games:
        assert [g["game_id"] for g in body["recent_games"]] == [game.id]
    else:
        assert body["recent_games"] is None
    if shows_diaries:
        assert [d["id"] for d in body["recent_diaries"]] == [diary.id]
    else:
        assert body["recent_diaries"] is None
    # 集計は、プロフィールが見えれば見せる
    assert body["game_count"] == 1


def test_own_private_scores_and_diaries_are_shown_to_me(
    client: TestClient, current_user, factories
) -> None:
    assert current_user.score_visibility == "private"
    assert current_user.diary_visibility == "private"
    game = factories.GameFactory(user=current_user)
    diary = factories.DiaryFactory(user=current_user)

    body = client.get(f"/api/v1/users/{current_user.id}/profile").json()
    assert [g["game_id"] for g in body["recent_games"]] == [game.id]
    assert [d["id"] for d in body["recent_diaries"]] == [diary.id]


@pytest.mark.parametrize(
    ("visibility", "same_organization", "status"),
    [
        ("private", True, 403),
        ("organization", True, 200),
        ("organization", False, 403),
        ("public", False, 200),
    ],
)
def test_other_users_profile_follows_its_visibility(
    client: TestClient,
    current_user,
    factories,
    visibility: str,
    same_organization: bool,
    status: int,
) -> None:
    organization = factories.OrganizationFactory()
    current_user.organization_id = organization.id
    other_organization = organization if same_organization else factories.OrganizationFactory()
    other = factories.UserFactory(
        sub="other-sub",
        profile_visibility=visibility,
        organization_id=other_organization.id,
    )

    assert client.get(f"/api/v1/users/{other.id}/profile").status_code == status


def test_organization_visibility_needs_an_organization_on_both_sides(
    client: TestClient, factories
) -> None:
    # 組織に入っていない利用者どうしは、組織公開でも見えない
    other = factories.UserFactory(sub="other-sub", profile_visibility="organization")

    assert client.get(f"/api/v1/users/{other.id}/profile").status_code == 403


def test_own_private_profile_is_viewable(client: TestClient, current_user) -> None:
    assert current_user.profile_visibility == "private"

    assert client.get(f"/api/v1/users/{current_user.id}/profile").status_code == 200
