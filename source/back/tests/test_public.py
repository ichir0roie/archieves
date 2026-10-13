"""ログインしていなくても読める、スコアの公開ページの API(GET /public/scores)。"""

from datetime import UTC, date, datetime

from fastapi.testclient import TestClient

from app.api.v1.endpoints.public import MAX_SHARED_GAMES

URL = "/api/v1/public/scores"


def _ids(response) -> list[int]:
    assert response.status_code == 200
    return [game["id"] for game in response.json()]


def test_anonymous_viewer_reads_only_public_scores(anonymous_client: TestClient, factories) -> None:
    public = factories.GameFactory(user=factories.UserFactory(score_visibility="public"))
    organization = factories.GameFactory(
        user=factories.UserFactory(
            score_visibility="organization",
            organization_id=factories.OrganizationFactory().id,
        )
    )
    private = factories.GameFactory()

    response = anonymous_client.get(
        URL, params={"game_ids": [public.id, organization.id, private.id]}
    )

    assert _ids(response) == [public.id]


def test_public_score_is_not_hidden_by_a_private_profile(
    anonymous_client: TestClient, factories
) -> None:
    # プロフィール・ランキングの公開範囲とは別に決める
    owner = factories.UserFactory(
        score_visibility="public",
        profile_visibility="private",
        ranking_visibility="private",
    )
    game = factories.GameFactory(user=owner)

    assert _ids(anonymous_client.get(URL, params={"game_ids": [game.id]})) == [game.id]


def test_signed_in_viewer_reads_own_and_visible_scores(
    client: TestClient, current_user, factories
) -> None:
    organization = factories.OrganizationFactory()
    current_user.organization_id = organization.id
    mine = factories.GameFactory(user=current_user, recorded_at=date(2026, 1, 1))
    public = factories.GameFactory(
        user=factories.UserFactory(score_visibility="public"),
        recorded_at=date(2026, 1, 2),
    )
    same_organization = factories.GameFactory(
        user=factories.UserFactory(
            score_visibility="organization", organization_id=organization.id
        ),
        recorded_at=date(2026, 1, 3),
    )
    other_organization = factories.GameFactory(
        user=factories.UserFactory(
            score_visibility="organization",
            organization_id=factories.OrganizationFactory().id,
        )
    )
    private = factories.GameFactory()

    response = client.get(
        URL,
        params={
            "game_ids": [
                private.id,
                other_organization.id,
                same_organization.id,
                public.id,
                mine.id,
            ]
        },
    )

    # 本人のゲームは、本人のスコアが非公開でも見える。日付の古い順
    assert _ids(response) == [mine.id, public.id, same_organization.id]


def test_organization_scores_are_hidden_between_users_without_an_organization(
    client: TestClient, factories
) -> None:
    game = factories.GameFactory(user=factories.UserFactory(score_visibility="organization"))

    assert _ids(client.get(URL, params={"game_ids": [game.id]})) == []


def test_unregistered_viewer_is_treated_as_anonymous(
    unregistered_client: TestClient, factories
) -> None:
    public = factories.GameFactory(user=factories.UserFactory(score_visibility="public"))
    private = factories.GameFactory()

    response = unregistered_client.get(URL, params={"game_ids": [public.id, private.id]})

    assert _ids(response) == [public.id]


def test_missing_and_deleted_games_are_left_out(anonymous_client: TestClient, factories) -> None:
    owner = factories.UserFactory(score_visibility="public")
    deleted = factories.GameFactory(user=owner, deleted_at=datetime.now(UTC))
    kept = factories.GameFactory(user=owner)

    response = anonymous_client.get(
        URL, params={"game_ids": [deleted.id, kept.id, kept.id + 10_000]}
    )

    assert _ids(response) == [kept.id]


def test_shared_score_carries_the_sheet_and_comments_but_not_the_owner_profile(
    anonymous_client: TestClient, factories
) -> None:
    owner = factories.UserFactory(name="Yumi", nickname="ゆみ", score_visibility="public")
    game = factories.GameFactory(user=owner, bow_type="recurve")
    round_ = factories.RoundFactory(game=game, number=1)
    deleted_round = factories.RoundFactory(game=game, number=2, deleted_at=datetime.now(UTC))
    end = factories.EndFactory(round=round_, number=1)
    factories.PointFactory(end=end, number=1, score=10, x=0.5, y=0.5)
    factories.GameCommentFactory(game=game, body="よく当たった")
    factories.RoundCommentFactory(round=round_, body="風が強い")
    factories.EndCommentFactory(end=end, body="上に寄った")

    response = anonymous_client.get(URL, params={"game_ids": [game.id]})

    assert response.status_code == 200
    [shared] = response.json()
    assert set(shared) == {"id", "owner_name", "recorded_at", "bow_type", "comment", "rounds"}
    assert shared["owner_name"] == "Yumi"
    assert shared["bow_type"] == "recurve"
    assert shared["comment"] == "よく当たった"
    assert [r["id"] for r in shared["rounds"]] == [round_.id]
    assert deleted_round.id not in [r["id"] for r in shared["rounds"]]
    [shared_round] = shared["rounds"]
    assert shared_round["comment"] == "風が強い"
    [shared_end] = shared_round["ends"]
    assert shared_end["comment"] == "上に寄った"
    assert [(p["score"], p["x"], p["y"]) for p in shared_end["points"]] == [(10, 0.5, 0.5)]


def test_game_ids_are_required_and_limited(anonymous_client: TestClient) -> None:
    assert anonymous_client.get(URL).status_code == 422
    assert anonymous_client.get(URL, params={"game_ids": ["x"]}).status_code == 422
    too_many = list(range(1, MAX_SHARED_GAMES + 2))
    assert anonymous_client.get(URL, params={"game_ids": too_many}).status_code == 422
