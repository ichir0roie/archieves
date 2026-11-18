"""写真モードの写真: 受け付け・送り(手元の置き場)・処理・一覧と、置き場(手元・S3)。"""

import io
from datetime import date
from pathlib import Path

import boto3
import pytest
from fastapi.testclient import TestClient
from moto import mock_aws
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import EndPhoto
from app.main import app
from app.services import photo_analysis
from app.services import photos as photo_service
from app.services.photo_analysis import ANALYZER_VERSION, EstimatedArrow, PhotoAnalysis, analyze
from app.services.photo_storage import (
    LocalPhotoStorage,
    S3PhotoStorage,
    get_photo_storage,
)

BUCKET = "archieves-photos-test"
REGION = "ap-northeast-1"


def jpeg(width: int = 400, height: int = 300, orientation: int | None = None) -> bytes:
    image = Image.new("RGB", (width, height), (200, 30, 30))
    exif = image.getexif()
    if orientation is not None:
        exif[0x0112] = orientation
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif)
    return buffer.getvalue()


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
    response = client.post(f"/api/v1/ends/{end_id}/photo", json={"content_type": content_type})
    assert response.status_code == 201
    return response.json()


def upload(client: TestClient, photo_id: int, data: bytes) -> None:
    response = client.put(
        f"/api/v1/photos/{photo_id}/file",
        content=data,
        headers={"Content-Type": "image/jpeg"},
    )
    assert response.status_code == 204


def process(client: TestClient, photo_id: int) -> dict:
    response = client.post(f"/api/v1/photos/{photo_id}/process")
    assert response.status_code == 200
    return response.json()


# ---- 受け付け・送り・処理 ----


def test_a_photo_is_uploaded_and_processed_into_a_display_image(client: TestClient, end) -> None:
    started = start(client, end.id)
    photo = started["photo"]

    assert started["upload_url"] == f"/photos/{photo['id']}/file"
    assert started["upload_headers"] == {"Content-Type": "image/jpeg"}
    assert photo["status"] == "uploading"
    assert photo["end_id"] == end.id
    assert photo["display_url"] is None
    assert photo["original_url"] == f"/photos/{photo['id']}/file?kind=original"

    # 横 4000・縦 3000 の画素を、EXIF で 90 度回して見せる写真
    original = jpeg(4000, 3000, orientation=6)
    upload(client, photo["id"], original)
    processed = process(client, photo["id"])

    assert processed["status"] == "processed"
    assert processed["analyzer_version"] == ANALYZER_VERSION
    assert (processed["width"], processed["height"]) == (3000, 4000)
    assert processed["rectified"] is False
    assert processed["estimates"] == []
    assert processed["error"] is None
    assert processed["processed_at"] is not None
    assert processed["display_url"] == f"/photos/{photo['id']}/file?kind=display"

    display = client.get(f"/api/v1{processed['display_url']}")
    assert display.status_code == 200
    assert display.headers["content-type"] == "image/jpeg"
    # 向きを直して、長辺を 2000px に縮める
    assert Image.open(io.BytesIO(display.content)).size == (1500, 2000)

    stored = client.get(f"/api/v1{processed['original_url']}")
    assert stored.status_code == 200
    assert stored.content == original


def test_processing_before_the_upload_is_a_conflict(client: TestClient, end) -> None:
    photo = start(client, end.id)["photo"]

    response = client.post(f"/api/v1/photos/{photo['id']}/process")

    assert response.status_code == 409
    assert response.json() == {"detail": "Photo not uploaded"}


def test_a_processed_photo_is_not_processed_again(
    client: TestClient, end, monkeypatch: pytest.MonkeyPatch
) -> None:
    photo = start(client, end.id)["photo"]
    upload(client, photo["id"], jpeg())
    first = process(client, photo["id"])
    calls: list[bytes] = []
    monkeypatch.setattr(photo_service, "analyze", lambda data: calls.append(data))

    second = process(client, photo["id"])

    assert calls == []
    assert second["processed_at"] == first["processed_at"]


def test_a_photo_processed_by_an_older_analyzer_is_processed_again(
    client: TestClient, s: Session, end, monkeypatch: pytest.MonkeyPatch
) -> None:
    photo = start(client, end.id)["photo"]
    upload(client, photo["id"], jpeg())
    process(client, photo["id"])
    row = s.get(EndPhoto, photo["id"])
    assert row is not None
    row.analyzer_version = "display-0"
    s.commit()

    def fake_analyze(data: bytes) -> PhotoAnalysis:
        return PhotoAnalysis(
            display_jpeg=jpeg(10, 10),
            width=400,
            height=300,
            rectified=True,
            display_extent=0.1,
            homography=[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            estimates=[EstimatedArrow(x=0.5, y=0.52, confidence=0.9)],
        )

    monkeypatch.setattr(photo_service, "analyze", fake_analyze)

    reprocessed = process(client, photo["id"])

    assert reprocessed["analyzer_version"] == ANALYZER_VERSION
    assert reprocessed["rectified"] is True
    assert reprocessed["display_extent"] == 0.1
    assert reprocessed["estimates"] == [{"x": 0.5, "y": 0.52, "confidence": 0.9}]
    assert row.homography == [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]


def test_an_unreadable_photo_fails_and_is_not_retried(
    client: TestClient, end, monkeypatch: pytest.MonkeyPatch
) -> None:
    photo = start(client, end.id)["photo"]
    upload(client, photo["id"], b"not an image")

    failed = process(client, photo["id"])

    assert failed["status"] == "failed"
    assert failed["error"] == "unreadable"
    assert failed["display_url"] is None

    calls: list[bytes] = []
    monkeypatch.setattr(photo_service, "analyze", lambda data: calls.append(data))
    assert process(client, photo["id"])["status"] == "failed"
    assert calls == []


def test_a_photo_over_the_size_limit_fails(
    client: TestClient, end, monkeypatch: pytest.MonkeyPatch
) -> None:
    photo = start(client, end.id)["photo"]
    upload(client, photo["id"], jpeg())
    monkeypatch.setattr(photo_service, "PHOTO_MAX_BYTES", 10)

    failed = process(client, photo["id"])

    assert failed["status"] == "failed"
    assert failed["error"] == "too_large"


def test_uploading_more_than_the_size_limit_is_refused(
    client: TestClient, end, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api.v1.endpoints import photos as photo_endpoints

    photo = start(client, end.id)["photo"]
    monkeypatch.setattr(photo_endpoints, "PHOTO_MAX_BYTES", 10)

    response = client.put(f"/api/v1/photos/{photo['id']}/file", content=b"x" * 11)

    assert response.status_code == 413


def test_retaking_a_photo_replaces_the_row_and_its_files(
    client: TestClient, s: Session, end, photo_storage: LocalPhotoStorage
) -> None:
    first = start(client, end.id)["photo"]
    upload(client, first["id"], jpeg())
    process(client, first["id"])
    first_files = sorted(p.name for p in photo_storage.root.rglob("*") if p.is_file())
    assert len(first_files) == 2

    second = start(client, end.id, "image/png")["photo"]

    assert second["id"] != first["id"]
    s.expire_all()
    assert s.get(EndPhoto, first["id"]) is None
    assert [p for p in photo_storage.root.rglob("*") if p.is_file()] == []
    row = s.get(EndPhoto, second["id"])
    assert row is not None
    assert row.original_key.endswith(".png")


def test_the_file_of_a_photo_that_is_not_processed_is_not_found(client: TestClient, end) -> None:
    photo = start(client, end.id)["photo"]

    assert client.get(f"/api/v1/photos/{photo['id']}/file?kind=display").status_code == 404
    assert client.get(f"/api/v1/photos/{photo['id']}/file").status_code == 404


def test_an_unsupported_content_type_is_refused(client: TestClient, end) -> None:
    response = client.post(f"/api/v1/ends/{end.id}/photo", json={"content_type": "image/heic"})

    assert response.status_code == 422


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

    assert (
        client.post(
            f"/api/v1/ends/{others_end.id}/photo", json={"content_type": "image/jpeg"}
        ).status_code
        == 403
    )
    assert client.post(f"/api/v1/photos/{others_photo.id}/process").status_code == 403
    assert client.put(f"/api/v1/photos/{others_photo.id}/file", content=b"x").status_code == 403
    assert client.get(f"/api/v1/photos/{others_photo.id}/file").status_code == 403
    assert client.get(f"/api/v1/games/{others_end.round.game_id}/photos").status_code == 403


def test_unknown_ends_photos_and_games_are_not_found(client: TestClient) -> None:
    assert (
        client.post("/api/v1/ends/0/photo", json={"content_type": "image/jpeg"}).status_code
        == 404
    )
    assert client.post("/api/v1/photos/0/process").status_code == 404
    assert client.get("/api/v1/games/0/photos").status_code == 404


def test_deleting_my_account_deletes_my_photo_files(
    client: TestClient, end, photo_storage: LocalPhotoStorage
) -> None:
    photo = start(client, end.id)["photo"]
    upload(client, photo["id"], jpeg())
    assert any(photo_storage.root.rglob("*.jpg"))

    assert client.delete("/api/v1/users/me").status_code == 204

    assert not any(photo_storage.root.rglob("*.jpg"))


# ---- 置き場 ----


def test_the_local_storage_keeps_keys_inside_its_directory(tmp_path: Path) -> None:
    storage = LocalPhotoStorage(tmp_path / "photos")

    with pytest.raises(ValueError):
        storage.read("../outside.jpg")
    # 無いディレクトリを消しても何もしない
    storage.delete_prefix("photos/1/")
    storage.write("photos/1/2/a.jpg", b"a", "image/jpeg")
    storage.write("photos/1/3/b.jpg", b"b", "image/jpeg")
    storage.delete(["photos/1/2/a.jpg", "photos/1/2/missing.jpg"])
    assert storage.read("photos/1/2/a.jpg") is None
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


def test_the_s3_storage_signs_urls_and_reads_and_writes(s3_storage: S3PhotoStorage) -> None:
    target = s3_storage.upload_target(1, "photos/1/2/a.jpg", "image/jpeg")

    # ブラウザが CORS で直に届くよう、地域の付いた仮想ホストの署名付き URL
    assert target.url.startswith(f"https://{BUCKET}.s3.{REGION}.amazonaws.com/photos/1/2/a.jpg?")
    assert "X-Amz-Signature=" in target.url
    assert target.headers == {"Content-Type": "image/jpeg"}
    assert s3_storage.download_url(1, "photos/1/2/a.jpg", "display").startswith(
        f"https://{BUCKET}.s3.{REGION}.amazonaws.com/photos/1/2/a.jpg?"
    )

    assert s3_storage.read("photos/1/2/a.jpg") is None
    s3_storage.write("photos/1/2/a.jpg", b"a", "image/jpeg")
    s3_storage.write("photos/1/3/b.jpg", b"b", "image/jpeg")
    s3_storage.write("photos/2/4/c.jpg", b"c", "image/jpeg")
    assert s3_storage.read("photos/1/2/a.jpg") == b"a"

    s3_storage.delete([])
    s3_storage.delete(["photos/1/2/a.jpg"])
    assert s3_storage.read("photos/1/2/a.jpg") is None

    s3_storage.delete_prefix("photos/1/")
    s3_storage.delete_prefix("photos/9/")
    assert s3_storage.read("photos/1/3/b.jpg") is None
    assert s3_storage.read("photos/2/4/c.jpg") == b"c"


def test_the_local_file_routes_are_not_found_with_s3(
    client: TestClient, end, s3_storage: S3PhotoStorage
) -> None:
    app.dependency_overrides[get_photo_storage] = lambda: s3_storage
    started = start(client, end.id)
    photo_id = started["photo"]["id"]

    assert started["upload_url"].startswith("https://")
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


# ---- 画像の処理 ----


def test_the_analyzer_keeps_small_photos_and_reads_png() -> None:
    buffer = io.BytesIO()
    Image.new("RGBA", (300, 200)).save(buffer, format="PNG")

    result = analyze(buffer.getvalue())

    assert (result.width, result.height) == (300, 200)
    assert Image.open(io.BytesIO(result.display_jpeg)).size == (300, 200)


def test_the_analyzer_refuses_too_many_pixels(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 100)

    with pytest.raises(photo_analysis.PhotoUnreadableError):
        analyze(jpeg(400, 300))


# ---- エンド・ラウンド・ゲームを消すと、写真の行とファイルも消す ----


def stored_files(storage: LocalPhotoStorage) -> list[Path]:
    return [p for p in storage.root.rglob("*") if p.is_file()]


def processed_photo(client: TestClient, end) -> dict:
    photo = start(client, end.id)["photo"]
    upload(client, photo["id"], jpeg())
    return process(client, photo["id"])


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
