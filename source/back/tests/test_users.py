import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crud import access_token as access_token_crud
from app.crud import user as user_crud
from app.db import AccessToken, Diary, ErrorReport, Feedback, Game, GameComment, Point, User
from app.schemas.user import UserCreate


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/users"),
        ("post", "/users"),
        ("post", "/users/find-or-create"),
        ("get", "/users/{other}"),
        ("patch", "/users/{other}"),
        ("get", "/users/{other}/profile"),
    ],
)
def test_users_are_not_addressed_by_id_or_sub(
    client: TestClient, factories, method: str, path: str
) -> None:
    """本人の行はログインから引き、他人のプロフィールは /public で読む。

    id や sub で指す口は置かない。
    """
    other = factories.UserFactory(profile_visibility="public")

    response = client.request(
        method,
        "/api/v1" + path.format(other=other.id),
        json={"name": "x", "sub": "someone-else"},
    )

    assert response.status_code in (404, 405)


def test_ensure_current_user_with_organization(
    unregistered_client: TestClient, factories
) -> None:
    organization = factories.OrganizationFactory()

    response = unregistered_client.post(
        "/api/v1/users/me/ensure",
        json={"name": "Kenta", "organization_id": organization.id},
    )
    assert response.status_code == 200
    assert response.json()["organization_id"] == organization.id


def test_ensure_current_user_with_missing_organization_returns_404(
    unregistered_client: TestClient,
) -> None:
    response = unregistered_client.post(
        "/api/v1/users/me/ensure",
        json={"name": "Kenta", "organization_id": 999999999},
    )
    assert response.status_code == 404


def test_birth_date_from_an_old_client_is_ignored(client: TestClient) -> None:
    # 生年月日は持たない。古い画面が送ってきても弾かず、捨てる
    response = client.patch(
        "/api/v1/users/me",
        json={"nickname": "Yu-chan", "birth_date": "1995-12-31"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["nickname"] == "Yu-chan"
    assert "birth_date" not in body
    assert "age" not in body


def test_update_my_basic_info(client: TestClient, current_user) -> None:
    patch_res = client.patch(
        "/api/v1/users/me",
        json={"nickname": "Yu-chan"},
    )
    assert patch_res.status_code == 200
    body = patch_res.json()
    assert body["id"] == current_user.id
    assert body["name"] == "Yumi"
    assert body["nickname"] == "Yu-chan"


def test_update_me_with_missing_organization_returns_404(client: TestClient) -> None:
    response = client.patch("/api/v1/users/me", json={"organization_id": 999999999})
    assert response.status_code == 404


def test_update_me_returns_404_when_not_registered(unregistered_client: TestClient) -> None:
    response = unregistered_client.patch("/api/v1/users/me", json={"nickname": "x"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Current user not registered"


def test_visibility_defaults_to_private(client: TestClient) -> None:
    me = client.get("/api/v1/users/me").json()
    assert me["profile_visibility"] == "private"
    assert me["ranking_visibility"] == "private"
    assert me["score_visibility"] == "private"


def test_update_visibility(client: TestClient) -> None:
    response = client.patch(
        "/api/v1/users/me",
        json={
            "profile_visibility": "organization",
            "ranking_visibility": "public",
            "score_visibility": "public",
        },
    )
    assert response.status_code == 200
    assert response.json()["profile_visibility"] == "organization"
    assert response.json()["ranking_visibility"] == "public"
    assert response.json()["score_visibility"] == "public"
    assert client.get("/api/v1/users/me").json()["ranking_visibility"] == "public"


@pytest.mark.parametrize(
    "payload",
    [
        {"profile_visibility": "friends"},
        {"ranking_visibility": None},
        {"score_visibility": "friends"},
        {"score_visibility": None},
    ],
)
def test_update_rejects_an_unknown_or_null_visibility(client: TestClient, payload: dict) -> None:
    assert client.patch("/api/v1/users/me", json=payload).status_code == 422


def test_ensure_current_user_creates_then_reuses(client: TestClient) -> None:
    payload = {"name": "Yumi"}

    first = client.post("/api/v1/users/me/ensure", json=payload)
    assert first.status_code == 200
    created = first.json()

    second = client.post("/api/v1/users/me/ensure", json={"name": "Someone Else"})
    assert second.status_code == 200
    assert second.json() == created


def test_get_me_returns_404_when_not_registered(unregistered_client: TestClient) -> None:
    response = unregistered_client.get("/api/v1/users/me")
    assert response.status_code == 404
    assert response.json()["detail"] == "Current user not registered"


def test_get_me_returns_current_user_after_ensure(client: TestClient) -> None:
    create_res = client.post("/api/v1/users/me/ensure", json={"name": "Yumi"})
    created = create_res.json()

    response = client.get("/api/v1/users/me")
    assert response.status_code == 200
    assert response.json() == created


def test_ensuring_a_user_reraises_an_integrity_error_that_is_not_a_race(
    s: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_crud.create_user(s, UserCreate(name="Yumi"), sub="taken-sub")
    monkeypatch.setattr(user_crud, "get_user_by_sub", lambda s, sub: None)

    with pytest.raises(IntegrityError):
        user_crud.get_or_create_user(s, UserCreate(name="Yumi"), sub="taken-sub")


def _count_owned_by(s: Session, model: type, user_id: int) -> int:
    return s.scalar(select(func.count()).select_from(model).where(model.user_id == user_id))


def test_delete_me_removes_my_row_and_everything_i_recorded(
    client: TestClient, s: Session, current_user, factories
) -> None:
    my_id = current_user.id
    point = factories.PointFactory(end__round__game__user=current_user)
    factories.GameCommentFactory(game=point.end.round.game)
    factories.DiaryFactory(user=current_user)
    factories.FeedbackFactory(user=current_user)
    factories.ErrorReportFactory(user=current_user)
    access_token_crud.create_access_token(s, current_user.id, "Claude Code", 30)
    others_point = factories.PointFactory()

    response = client.delete("/api/v1/users/me")

    assert response.status_code == 204
    s.expire_all()
    assert s.get(User, my_id) is None
    for model in (Game, Point, GameComment, Diary, Feedback, ErrorReport, AccessToken):
        assert _count_owned_by(s, model, my_id) == 0, model.__name__
    # 他人の記録は残す
    assert s.get(Point, others_point.id) is not None
    # 消したあとは登録の前と同じに扱う
    assert client.get("/api/v1/users/me").status_code == 404


def test_delete_me_returns_404_when_not_registered(unregistered_client: TestClient) -> None:
    response = unregistered_client.delete("/api/v1/users/me")
    assert response.status_code == 404
    assert response.json()["detail"] == "Current user not registered"


def test_is_admin_is_returned_only_for_myself(
    client: TestClient, s: Session, current_user, factories
) -> None:
    assert client.get("/api/v1/users/me").json()["is_admin"] is False

    current_user.is_admin = True
    s.flush()
    other = factories.UserFactory(is_admin=True)

    assert client.get("/api/v1/users/me").json()["is_admin"] is True
    other.profile_visibility = "public"
    shown = client.get(f"/api/v1/public/users/{other.id}/profile").json()["user"]
    assert "is_admin" not in shown
    assert "sub" not in shown
    assert "profile_visibility" not in shown
