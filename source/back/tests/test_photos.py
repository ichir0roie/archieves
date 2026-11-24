"""写真モードの写真: 受け付け・送り(手元の置き場)・処理の結果の受け取り・一覧と、置き場(手元・S3)。

写真の処理(的の補正と矢の推測)はブラウザが行う(source/front の lib/photo/vision)。
API は写真と結果を置くだけ。
"""

from datetime import date
from pathlib import Path

import boto3
import pytest
from fastapi.testclient import TestClient
from moto import mock_aws
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.photos import PHOTO_DISPLAY_MAX_BYTES, PHOTO_MAX_BYTES, PHOTO_MAX_ESTIMATES
from app.db import EndPhoto, Round
from app.main import app
from app.services import photos as photo_service
from app.services.photo_storage import (
    LocalPhotoStorage,
    S3PhotoStorage,
    get_photo_storage,
)

BUCKET = "archieves-photos-test"
REGION = "ap-northeast-1"
ORIGINAL = b"original photo bytes"
DISPLAY = b"display jpeg bytes"
# 元の写真の px を 1/1000 にして、的の割合とみなす行列
HOMOGRAPHY = [[0.001, 0.0, 0.0], [0.0, 0.001, 0.0], [0.0, 0.0, 1.0]]
ALIGNMENT = [[0.5, 0.2], [0.8, 0.5], [0.5, 0.8], [0.2, 0.5]]


@pytest.fixture()
def end(factories, current_user):
    return factories.EndFactory(round__game__user=current_user)


def add_photo(s: Session, end) -> EndPhoto:
    """API を通さずに写真の行を作る(他人のエンド・ゴミ箱のエンドの分)"""
    photo = EndPhoto(
        end_id=end.id,
        user_id=end.user_id,
        status="uploading",
        content_type="image/jpeg",
        original_key=f"photos/{end.user_id}/{end.id}/a.jpg",
    )
    s.add(photo)
    s.flush()
    return photo


def start(client: TestClient, end_id: int, content_type: str = "image/jpeg") -> dict:
    response = client.post(
        f"/api/v1/ends/{end_id}/photo",
        json={
            "content_type": content_type,
            "content_length": len(ORIGINAL),
            "display_content_length": len(DISPLAY),
        },
    )
    assert response.status_code == 201
    return response.json()


def upload(client: TestClient, url: str, data: bytes, content_type: str = "image/jpeg") -> None:
    response = client.put(f"/api/v1{url}", content=data, headers={"Content-Type": content_type})
    assert response.status_code == 204


def analysis(display_key: str, **overrides) -> dict:
    """ブラウザが処理した結果(的を補正でき、矢を一本推測した)"""
    return {
        "display_key": display_key,
        "analyzer_version": "web-1",
        "width": 1000,
        "height": 2000,
        "rectified": True,
        "display_extent": 0.25,
        "homography": HOMOGRAPHY,
        "estimates": [{"x": 0.5, "y": 0.52, "confidence": 0.9}],
        "alignment_points": None,
        **overrides,
    }


def save(client: TestClient, photo_id: int, body: dict):
    return client.put(f"/api/v1/photos/{photo_id}/analysis", json=body)


def processed_photo(client: TestClient, end) -> dict:
    """撮って、元の写真と表示の画像を送り、結果を書いた写真"""
    started = start(client, end.id)
    upload(client, started["upload_url"], ORIGINAL)
    upload(client, started["display"]["upload_url"], DISPLAY)
    response = save(client, started["photo"]["id"], analysis(started["display"]["display_key"]))
    assert response.status_code == 200
    return response.json()


def stored_files(storage: LocalPhotoStorage) -> list[Path]:
    return [p for p in storage.root.rglob("*") if p.is_file()]


# ---- 受け付け・送り・結果 ----


def test_a_photo_is_uploaded_with_its_display_image_and_analysis(
    client: TestClient, s: Session, end
) -> None:
    started = start(client, end.id)
    photo = started["photo"]

    assert started["upload_url"].startswith(f"/photos/{photo['id']}/file?key=photos%2F")
    assert started["upload_headers"] == {"Content-Type": "image/jpeg"}
    display = started["display"]
    assert display["display_key"].startswith(f"photos/{end.user_id}/{end.id}/")
    assert display["display_key"].endswith(".jpg")
    assert display["upload_headers"] == {"Content-Type": "image/jpeg"}
    assert photo["status"] == "uploading"
    assert photo["end_id"] == end.id
    assert photo["display_url"] is None
    assert photo["original_url"] == f"/photos/{photo['id']}/file?kind=original"

    upload(client, started["upload_url"], ORIGINAL)
    upload(client, display["upload_url"], DISPLAY)
    response = save(client, photo["id"], analysis(display["display_key"]))

    assert response.status_code == 200
    processed = response.json()
    assert processed["status"] == "processed"
    assert processed["analyzer_version"] == "web-1"
    assert (processed["width"], processed["height"]) == (1000, 2000)
    assert processed["rectified"] is True
    assert processed["display_extent"] == 0.25
    assert processed["estimates"] == [{"x": 0.5, "y": 0.52, "confidence": 0.9}]
    assert processed["aligned_manually"] is False
    assert processed["error"] is None
    assert processed["processed_at"] is not None
    assert processed["display_url"] == f"/photos/{photo['id']}/file?kind=display"
    row = s.get(EndPhoto, photo["id"])
    assert row is not None
    assert row.homography == HOMOGRAPHY

    shown = client.get(f"/api/v1{processed['display_url']}")
    assert shown.status_code == 200
    assert shown.headers["content-type"] == "image/jpeg"
    assert shown.content == DISPLAY
    stored = client.get(f"/api/v1{processed['original_url']}")
    assert stored.status_code == 200
    assert stored.content == ORIGINAL


def test_a_photo_without_a_target_is_kept_without_estimates(client: TestClient, end) -> None:
    started = start(client, end.id)
    upload(client, started["upload_url"], ORIGINAL)
    upload(client, started["display"]["upload_url"], DISPLAY)

    response = save(
        client,
        started["photo"]["id"],
        analysis(
            started["display"]["display_key"],
            rectified=False,
            display_extent=None,
            homography=None,
            estimates=[],
        ),
    )

    assert response.status_code == 200
    assert response.json()["rectified"] is False
    assert response.json()["alignment_points"] is None


@pytest.mark.parametrize("uploaded", [[], ["original"], ["display"]])
def test_saving_the_analysis_before_both_files_arrive_is_a_conflict(
    client: TestClient, s: Session, end, uploaded: list[str]
) -> None:
    started = start(client, end.id)
    if "original" in uploaded:
        upload(client, started["upload_url"], ORIGINAL)
    if "display" in uploaded:
        upload(client, started["display"]["upload_url"], DISPLAY)

    response = save(client, started["photo"]["id"], analysis(started["display"]["display_key"]))

    assert response.status_code == 409
    assert response.json() == {"detail": "Photo not uploaded"}
    row = s.get(EndPhoto, started["photo"]["id"])
    assert row is not None
    assert row.status == "uploading"


@pytest.mark.parametrize(
    "key",
    [
        # ほかの写真のキー・元の写真のキー・決まりに合わないキー
        "photos/1/2/0123456789abcdef0123456789abcdef-display-0123456789abcdef0123456789abcdef.jpg",
        "original",
        "../../etc/passwd",
    ],
)
def test_a_display_key_that_is_not_the_photos_is_refused(client: TestClient, end, key: str) -> None:
    started = start(client, end.id)
    upload(client, started["upload_url"], ORIGINAL)
    original_key = started["upload_url"].split("key=")[1].replace("%2F", "/")
    body = analysis(original_key if key == "original" else key)

    response = save(client, started["photo"]["id"], body)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "overrides",
    [
        # 補正できたのに写し方が無い・補正できないのに推測がある
        {"homography": None},
        {"display_extent": None},
        {"rectified": False, "homography": None, "display_extent": None},
        {"homography": [[1.0, 0.0], [0.0, 1.0]]},
        {"estimates": [{"x": 0.5, "y": 5.0, "confidence": 0.5}]},
        {"estimates": [{"x": 0.5, "y": 0.5, "confidence": 1.5}]},
        {"estimates": [{"x": 0.5, "y": 0.5, "confidence": 0.5}] * (PHOTO_MAX_ESTIMATES + 1)},
        {"width": 0},
        {"analyzer_version": ""},
        {"analyzer_version": "v" * 33},
        # 手で合わせた 4 点が崩れている
        {"alignment_points": ALIGNMENT[:3]},
        {"alignment_points": [ALIGNMENT[0], ALIGNMENT[3], ALIGNMENT[2], ALIGNMENT[1]]},
        {"alignment_points": [[0.5, 0.5]] * 4},
        {"alignment_points": [[0.5, 0.2, 0.0], [0.8, 0.5], [0.5, 0.8], [0.2, 0.5]]},
        {"alignment_points": [[0.5, -3.0], [0.8, 0.5], [0.5, 0.8], [0.2, 0.5]]},
    ],
)
def test_a_malformed_analysis_is_refused(client: TestClient, end, overrides: dict) -> None:
    started = start(client, end.id)

    response = save(
        client, started["photo"]["id"], analysis(started["display"]["display_key"], **overrides)
    )

    assert response.status_code == 422


def test_a_photo_is_aligned_by_hand_with_a_new_display_image(
    client: TestClient, end, photo_storage: LocalPhotoStorage
) -> None:
    first = processed_photo(client, end)
    first_display = [p for p in stored_files(photo_storage) if "-display-" in p.name]
    assert len(first_display) == 1

    response = client.post(
        f"/api/v1/photos/{first['id']}/display", json={"content_length": len(DISPLAY)}
    )
    assert response.status_code == 200
    target = response.json()
    assert target["display_key"] not in first_display[0].as_posix()
    # 結果を書くまでは、前の表示の画像を出す
    upload(client, target["upload_url"], b"realigned display")
    assert client.get(f"/api/v1{first['display_url']}").content == DISPLAY

    response = save(
        client,
        first["id"],
        analysis(
            target["display_key"],
            alignment_points=ALIGNMENT,
            estimates=[{"x": 0.4, "y": 0.6, "confidence": 0.7}],
        ),
    )

    assert response.status_code == 200
    aligned = response.json()
    assert aligned["aligned_manually"] is True
    assert aligned["alignment_points"] == ALIGNMENT
    assert aligned["estimates"] == [{"x": 0.4, "y": 0.6, "confidence": 0.7}]
    assert client.get(f"/api/v1{aligned['display_url']}").content == b"realigned display"
    # 前の表示の画像は消す
    assert not first_display[0].exists()
    assert len(stored_files(photo_storage)) == 2


def test_alignment_points_are_derived_from_the_automatic_rectification(
    client: TestClient, s: Session, end
) -> None:
    photo = processed_photo(client, end)

    round_ = s.get(Round, end.round_id)
    assert round_ is not None
    listed = client.get(f"/api/v1/games/{round_.game_id}/photos").json()[0]

    assert listed["id"] == photo["id"]
    assert listed["aligned_manually"] is False
    # 赤の帯の外の線(的の割合で半径 0.2)の上・右・下・左を、幅 1000・高さ 2000 の写真の割合に
    expected = [[0.5, 0.15], [0.7, 0.25], [0.5, 0.35], [0.3, 0.25]]
    for got, point in zip(listed["alignment_points"], expected, strict=True):
        assert got == pytest.approx(point)


def test_a_singular_homography_has_no_alignment_points(client: TestClient, end) -> None:
    started = start(client, end.id)
    upload(client, started["upload_url"], ORIGINAL)
    upload(client, started["display"]["upload_url"], DISPLAY)

    response = save(
        client,
        started["photo"]["id"],
        analysis(started["display"]["display_key"], homography=[[0.0] * 3] * 3),
    )

    assert response.status_code == 200
    assert response.json()["alignment_points"] is None


@pytest.mark.parametrize(
    ("field", "limit"),
    [("content_length", PHOTO_MAX_BYTES), ("display_content_length", PHOTO_DISPLAY_MAX_BYTES)],
)
@pytest.mark.parametrize("over", [False, True])
def test_a_photo_size_outside_the_limit_is_refused_before_the_upload(
    client: TestClient, end, field: str, limit: int, over: bool
) -> None:
    body = {"content_type": "image/jpeg", "content_length": 1000, "display_content_length": 1000}
    body[field] = limit + 1 if over else 0

    response = client.post(f"/api/v1/ends/{end.id}/photo", json=body)

    assert response.status_code == 422


@pytest.mark.parametrize("content_length", [0, PHOTO_DISPLAY_MAX_BYTES + 1])
def test_a_display_size_outside_the_limit_is_refused(
    client: TestClient, end, content_length: int
) -> None:
    photo = start(client, end.id)["photo"]

    response = client.post(
        f"/api/v1/photos/{photo['id']}/display", json={"content_length": content_length}
    )

    assert response.status_code == 422


@pytest.mark.parametrize("which", ["original", "display"])
def test_uploading_more_than_the_size_limit_is_refused(
    client: TestClient, end, monkeypatch: pytest.MonkeyPatch, which: str
) -> None:
    from app.api.v1.endpoints import photos as photo_endpoints

    started = start(client, end.id)
    monkeypatch.setattr(photo_endpoints, "PHOTO_MAX_BYTES", 10)
    monkeypatch.setattr(photo_endpoints, "PHOTO_DISPLAY_MAX_BYTES", 10)
    url = started["upload_url"] if which == "original" else started["display"]["upload_url"]

    response = client.put(f"/api/v1{url}", content=b"x" * 11)

    assert response.status_code == 413


def test_the_original_is_uploaded_without_a_key_and_other_keys_are_refused(
    client: TestClient, end
) -> None:
    started = start(client, end.id)
    photo_id = started["photo"]["id"]

    assert client.put(f"/api/v1/photos/{photo_id}/file", content=ORIGINAL).status_code == 204
    assert client.get(f"/api/v1/photos/{photo_id}/file").content == ORIGINAL
    response = client.put(
        f"/api/v1/photos/{photo_id}/file?key=photos/1/elsewhere.jpg", content=b"x"
    )
    assert response.status_code == 422


def test_retaking_a_photo_replaces_the_row_and_its_files(
    client: TestClient, s: Session, end, photo_storage: LocalPhotoStorage
) -> None:
    first = processed_photo(client, end)
    assert len(stored_files(photo_storage)) == 2

    second = start(client, end.id, "image/png")["photo"]

    assert second["id"] != first["id"]
    s.expire_all()
    assert s.get(EndPhoto, first["id"]) is None
    assert stored_files(photo_storage) == []
    row = s.get(EndPhoto, second["id"])
    assert row is not None
    assert row.original_key.endswith(".png")


def test_the_file_of_a_photo_that_is_not_processed_is_not_found(client: TestClient, end) -> None:
    photo = start(client, end.id)["photo"]

    assert client.get(f"/api/v1/photos/{photo['id']}/file?kind=display").status_code == 404
    assert client.get(f"/api/v1/photos/{photo['id']}/file").status_code == 404


def test_an_unsupported_content_type_is_refused(client: TestClient, end) -> None:
    response = client.post(
        f"/api/v1/ends/{end.id}/photo",
        json={"content_type": "image/heic", "content_length": 1000, "display_content_length": 10},
    )

    assert response.status_code == 422


def test_display_keys_belong_to_their_photo(s: Session, end) -> None:
    photo = add_photo(s, end)
    key = photo_service.new_display_key(photo)

    assert key.startswith(f"photos/{end.user_id}/{end.id}/a-display-")
    assert photo_service.is_display_key(photo, key)
    assert not photo_service.is_display_key(photo, photo.original_key)
    assert not photo_service.is_display_key(photo, key.replace("/a-", "/b-"))
    assert not photo_service.is_display_key(photo, key + ".jpg")


# ---- 一覧・記録の読み ----


def test_the_photos_of_a_game_are_listed_in_order_without_trashed_rounds(
    client: TestClient, s: Session, factories, current_user
) -> None:
    game = factories.GameFactory(user=current_user)
    round_2 = factories.RoundFactory(game=game, number=2)
    round_1 = factories.RoundFactory(game=game, number=1)
    trashed = factories.RoundFactory(game=game, number=3, deleted_at=date(2026, 1, 1))
    end_1_2 = factories.EndFactory(round=round_1, number=2)
    end_1_1 = factories.EndFactory(round=round_1, number=1)
    end_2_1 = factories.EndFactory(round=round_2, number=1)
    trashed_end = factories.EndFactory(round=trashed, number=1)
    factories.EndFactory(round=round_1, number=3)
    for end in (end_2_1, end_1_2, end_1_1):
        start(client, end.id)
    # ゴミ箱のラウンドのエンドは API からは撮れないので、行を直に作る
    add_photo(s, trashed_end)

    response = client.get(f"/api/v1/games/{game.id}/photos")

    assert response.status_code == 200
    assert [p["end_id"] for p in response.json()] == [end_1_1.id, end_1_2.id, end_2_1.id]


def test_the_sheet_tells_which_ends_have_a_photo(
    client: TestClient, factories, current_user
) -> None:
    game = factories.GameFactory(user=current_user)
    round_ = factories.RoundFactory(game=game)
    with_photo = factories.EndFactory(round=round_, number=1)
    factories.EndFactory(round=round_, number=2)
    start(client, with_photo.id)

    sheet = client.get(f"/api/v1/games/{game.id}/sheet").json()

    assert [end["has_photo"] for end in sheet["rounds"][0]["ends"]] == [True, False]


# ---- 持ち主 ----


def test_another_users_end_and_photo_are_forbidden(
    client: TestClient, s: Session, factories
) -> None:
    others_end = factories.EndFactory()
    others_photo = add_photo(s, others_end)
    key = photo_service.new_display_key(others_photo)

    assert (
        client.post(
            f"/api/v1/ends/{others_end.id}/photo",
            json={
                "content_type": "image/jpeg",
                "content_length": 1000,
                "display_content_length": 10,
            },
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/photos/{others_photo.id}/display", json={"content_length": 10}
        ).status_code
        == 403
    )
    assert save(client, others_photo.id, analysis(key)).status_code == 403
    assert client.put(f"/api/v1/photos/{others_photo.id}/file", content=b"x").status_code == 403
    assert client.get(f"/api/v1/photos/{others_photo.id}/file").status_code == 403
    assert client.get(f"/api/v1/games/{others_end.round.game_id}/photos").status_code == 403


def test_unknown_ends_photos_and_games_are_not_found(client: TestClient) -> None:
    assert (
        client.post(
            "/api/v1/ends/0/photo",
            json={
                "content_type": "image/jpeg",
                "content_length": 1000,
                "display_content_length": 10,
            },
        ).status_code
        == 404
    )
    assert client.post("/api/v1/photos/0/display", json={"content_length": 10}).status_code == 404
    assert save(client, 0, analysis("x")).status_code == 404
    assert client.get("/api/v1/games/0/photos").status_code == 404


def test_deleting_my_account_deletes_my_photo_files(
    client: TestClient, end, photo_storage: LocalPhotoStorage
) -> None:
    processed_photo(client, end)
    assert any(photo_storage.root.rglob("*.jpg"))

    assert client.delete("/api/v1/users/me").status_code == 204

    assert not any(photo_storage.root.rglob("*.jpg"))


# ---- 置き場 ----


def test_the_local_storage_keeps_keys_inside_its_directory(tmp_path: Path) -> None:
    storage = LocalPhotoStorage(tmp_path / "photos")

    with pytest.raises(ValueError):
        storage.read("../outside.jpg")
    with pytest.raises(ValueError):
        storage.exists("../outside.jpg")
    # 無いディレクトリを消しても何もしない
    storage.delete_prefix("photos/1/")
    storage.write("photos/1/2/a.jpg", b"a", "image/jpeg")
    storage.write("photos/1/3/b.jpg", b"b", "image/jpeg")
    assert storage.exists("photos/1/2/a.jpg")
    storage.delete(["photos/1/2/a.jpg", "photos/1/2/missing.jpg"])
    assert storage.read("photos/1/2/a.jpg") is None
    assert not storage.exists("photos/1/2/a.jpg")
    storage.delete_prefix("photos/1/")
    assert storage.read("photos/1/3/b.jpg") is None
    assert not (tmp_path / "photos" / "photos" / "1").exists()


@pytest.fixture()
def s3_storage():
    with mock_aws():
        boto3.client("s3", region_name=REGION).create_bucket(
            Bucket=BUCKET,
            CreateBucketConfiguration={"LocationConstraint": REGION},
        )
        yield S3PhotoStorage(BUCKET, REGION, 600)


def put_object(key: str) -> None:
    boto3.client("s3", region_name=REGION).put_object(Bucket=BUCKET, Key=key, Body=b"x")


def test_the_s3_storage_signs_urls_and_checks_and_deletes_files(
    s3_storage: S3PhotoStorage,
) -> None:
    target = s3_storage.upload_target(1, "photos/1/2/a.jpg", "image/jpeg", 1000)

    # ブラウザが CORS で直に届くよう、地域の付いた仮想ホストの署名付き URL
    assert target.url.startswith(f"https://{BUCKET}.s3.{REGION}.amazonaws.com/photos/1/2/a.jpg?")
    assert "X-Amz-Signature=" in target.url
    # 大きさを縛るため、Content-Length を署名に入れる
    assert "X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost" in target.url
    assert target.headers == {"Content-Type": "image/jpeg"}
    assert s3_storage.download_url(1, "photos/1/2/a.jpg", "display").startswith(
        f"https://{BUCKET}.s3.{REGION}.amazonaws.com/photos/1/2/a.jpg?"
    )

    assert not s3_storage.exists("photos/1/2/a.jpg")
    for key in ("photos/1/2/a.jpg", "photos/1/3/b.jpg", "photos/2/4/c.jpg"):
        put_object(key)
    assert s3_storage.exists("photos/1/2/a.jpg")

    s3_storage.delete([])
    s3_storage.delete(["photos/1/2/a.jpg"])
    assert not s3_storage.exists("photos/1/2/a.jpg")

    s3_storage.delete_prefix("photos/1/")
    s3_storage.delete_prefix("photos/9/")
    assert not s3_storage.exists("photos/1/3/b.jpg")
    assert s3_storage.exists("photos/2/4/c.jpg")


def test_the_s3_storage_raises_errors_other_than_a_missing_file(
    s3_storage: S3PhotoStorage, monkeypatch: pytest.MonkeyPatch
) -> None:
    from botocore.exceptions import ClientError

    def forbidden(**kwargs):
        raise ClientError({"Error": {"Code": "403", "Message": "Forbidden"}}, "HeadObject")

    monkeypatch.setattr(s3_storage.client, "head_object", forbidden)

    with pytest.raises(ClientError):
        s3_storage.exists("photos/1/2/a.jpg")


def test_the_photo_flow_works_with_s3(client: TestClient, end, s3_storage: S3PhotoStorage) -> None:
    app.dependency_overrides[get_photo_storage] = lambda: s3_storage
    started = start(client, end.id)
    photo_id = started["photo"]["id"]

    assert started["upload_url"].startswith("https://")
    assert started["display"]["upload_url"].startswith("https://")
    # ブラウザが S3 へ直に送ったものとする
    original_key = started["upload_url"].split(".amazonaws.com/")[1].split("?")[0]
    put_object(original_key)
    put_object(started["display"]["display_key"])
    response = save(client, photo_id, analysis(started["display"]["display_key"]))

    assert response.status_code == 200
    assert response.json()["display_url"].startswith("https://")
    # 手元の置き場の道は無い
    assert client.put(f"/api/v1/photos/{photo_id}/file", content=b"x").status_code == 404
    assert client.get(f"/api/v1/photos/{photo_id}/file").status_code == 404


def test_the_storage_follows_the_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    get_photo_storage.cache_clear()
    monkeypatch.setattr(settings, "PHOTO_STORAGE", "s3")
    monkeypatch.setattr(settings, "PHOTO_BUCKET", BUCKET)
    try:
        storage = get_photo_storage()
        assert isinstance(storage, S3PhotoStorage)
        assert storage.bucket == BUCKET
        get_photo_storage.cache_clear()
        monkeypatch.setattr(settings, "PHOTO_STORAGE", "local")
        assert isinstance(get_photo_storage(), LocalPhotoStorage)
    finally:
        get_photo_storage.cache_clear()


# ---- エンド・ラウンド・ゲームを消すと、写真の行とファイルも消す ----


def test_deleting_an_end_deletes_its_photo(
    client: TestClient, s: Session, end, photo_storage: LocalPhotoStorage
) -> None:
    photo = processed_photo(client, end)
    assert len(stored_files(photo_storage)) == 2

    assert client.delete(f"/api/v1/ends/{end.id}").status_code == 204

    s.expire_all()
    assert s.get(EndPhoto, photo["id"]) is None
    assert stored_files(photo_storage) == []


def test_trashing_a_round_or_a_game_keeps_their_photos(
    client: TestClient, s: Session, factories, current_user, photo_storage: LocalPhotoStorage
) -> None:
    """ゴミ箱から戻せるので、写真は消さない。戻せば写真も付いたまま"""
    game = factories.GameFactory(user=current_user)
    round_1 = factories.RoundFactory(game=game, number=1)
    round_2 = factories.RoundFactory(game=game, number=2)
    processed_photo(client, factories.EndFactory(round=round_1))
    processed_photo(client, factories.EndFactory(round=round_2))

    assert client.delete(f"/api/v1/rounds/{round_1.id}").status_code == 204
    assert client.delete(f"/api/v1/games/{game.id}").status_code == 204
    assert len(stored_files(photo_storage)) == 4

    assert client.post(f"/api/v1/games/{game.id}/restore").status_code == 200
    assert client.post(f"/api/v1/rounds/{round_1.id}/restore").status_code == 200
    sheet = client.get(f"/api/v1/games/{game.id}/sheet").json()
    assert [end["has_photo"] for r in sheet["rounds"] for end in r["ends"]] == [True, True]
    assert len(client.get(f"/api/v1/games/{game.id}/photos").json()) == 2


def test_ends_left_out_of_a_saved_sheet_lose_their_photos_but_trashed_rounds_keep_them(
    client: TestClient, s: Session, factories, current_user, photo_storage: LocalPhotoStorage
) -> None:
    game = factories.GameFactory(user=current_user)
    kept_round = factories.RoundFactory(game=game, number=1)
    dropped_round = factories.RoundFactory(game=game, number=2)
    kept_end = factories.EndFactory(round=kept_round, number=1)
    dropped_end = factories.EndFactory(round=kept_round, number=2)
    kept = processed_photo(client, kept_end)
    processed_photo(client, dropped_end)
    in_dropped_round = processed_photo(client, factories.EndFactory(round=dropped_round))
    sheet = client.get(f"/api/v1/games/{game.id}/sheet").json()
    sheet["rounds"] = sheet["rounds"][:1]
    sheet["rounds"][0]["ends"] = sheet["rounds"][0]["ends"][:1]

    response = client.put("/api/v1/games/sheet", json=sheet)

    assert response.status_code == 200
    assert [end["has_photo"] for end in response.json()["rounds"][0]["ends"]] == [True]
    s.expire_all()
    photo_ids = select(EndPhoto.id).where(EndPhoto.user_id == current_user.id).order_by(EndPhoto.id)
    assert list(s.scalars(photo_ids)) == [kept["id"], in_dropped_round["id"]]
    assert len(stored_files(photo_storage)) == 4
