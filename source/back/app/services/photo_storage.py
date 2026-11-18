"""写真のファイルの置き場。本番は S3、手元・テストはディレクトリ(設定の PHOTO_STORAGE)。

ブラウザは、置き場が返す URL へ元の写真を PUT し、表示の画像・元の写真を GET する。
S3 なら署名付き URL で S3 に直に届く(API の Lambda を通すと 6MB の上限にかかるため)。
手元なら API の道(endpoints/photos.py の /photos/{id}/file)を指し、
API がディレクトリを読み書きする。

ファイルを消すのは、撮り直したとき(前の写真の delete)と、
アカウントを消したとき(delete_prefix)。
エンド・ゲームの行を消しても、ここのファイルは残る。
"""

import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal, Protocol

import boto3
from botocore.config import Config

from app.core.config import settings

logger = logging.getLogger(__name__)

PhotoKind = Literal["original", "display"]


@dataclass(frozen=True)
class UploadTarget:
    """ブラウザが元の写真を送る先。

    url が http で始まらなければ API の道(API の /api/v1 からの相対)。
    """

    url: str
    headers: dict[str, str]


def user_prefix(user_id: int) -> str:
    """その人の写真のキーの頭。アカウントを消すとき、ここから下を消す"""
    return f"photos/{user_id}/"


class PhotoStorage(Protocol):
    def upload_target(self, photo_id: int, key: str, content_type: str) -> UploadTarget: ...

    def download_url(self, photo_id: int, key: str, kind: PhotoKind) -> str: ...

    def read(self, key: str) -> bytes | None: ...

    def write(self, key: str, data: bytes, content_type: str) -> None: ...

    def delete(self, keys: list[str]) -> None: ...

    def delete_prefix(self, prefix: str) -> None: ...


class LocalPhotoStorage:
    """手元・テスト用。キーをディレクトリの中のパスにする。送る・読むは API の道を通す"""

    def __init__(self, root: Path) -> None:
        self.root = root

    def _path(self, key: str) -> Path:
        # キーは API が作るものだけだが、念のためディレクトリの外を指させない
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise ValueError(f"Invalid photo key: {key}")
        return path

    def upload_target(self, photo_id: int, key: str, content_type: str) -> UploadTarget:
        return UploadTarget(url=f"/photos/{photo_id}/file", headers={"Content-Type": content_type})

    def download_url(self, photo_id: int, key: str, kind: PhotoKind) -> str:
        return f"/photos/{photo_id}/file?kind={kind}"

    def read(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.is_file() else None

    def write(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def delete(self, keys: list[str]) -> None:
        for key in keys:
            self._path(key).unlink(missing_ok=True)

    def delete_prefix(self, prefix: str) -> None:
        directory = self._path(prefix)
        if not directory.is_dir():
            return
        for path in sorted(directory.rglob("*"), reverse=True):
            if path.is_dir():
                path.rmdir()
            else:
                path.unlink()
        directory.rmdir()


class S3PhotoStorage:
    """本番用。URL は Lambda の中で署名するだけなので、作るのに S3 へは出ない。
    読み書き(処理のときの元の写真・表示の画像)は、VPC の S3 のエンドポイントを通る"""

    def __init__(self, bucket: str, region: str, expires_seconds: int) -> None:
        self.bucket = bucket
        self.expires_seconds = expires_seconds
        # 地域の付いた仮想ホストの URL にする。地域の無い URL はリダイレクトされ、ブラウザの
        # CORS の確かめ(プリフライト)が通らない
        self.client = boto3.client(
            "s3",
            region_name=region,
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
        )

    def upload_target(self, photo_id: int, key: str, content_type: str) -> UploadTarget:
        url = self.client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=self.expires_seconds,
        )
        return UploadTarget(url=url, headers={"Content-Type": content_type})

    def download_url(self, photo_id: int, key: str, kind: PhotoKind) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=self.expires_seconds,
        )

    def read(self, key: str) -> bytes | None:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
        except self.client.exceptions.NoSuchKey:
            return None
        return response["Body"].read()

    def write(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def delete(self, keys: list[str]) -> None:
        if keys:
            self.client.delete_objects(
                Bucket=self.bucket,
                Delete={"Objects": [{"Key": key} for key in keys]},
            )

    def delete_prefix(self, prefix: str) -> None:
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
            keys = [{"Key": item["Key"]} for item in page.get("Contents", [])]
            if keys:
                self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": keys})


@lru_cache
def get_photo_storage() -> PhotoStorage:
    """設定の置き場。エンドポイントは依存(Depends)で受け、テストは差し替える"""
    if settings.PHOTO_STORAGE == "s3":
        return S3PhotoStorage(
            settings.PHOTO_BUCKET,
            settings.AWS_REGION,
            settings.PHOTO_URL_EXPIRES_SECONDS,
        )
    return LocalPhotoStorage(Path(settings.PHOTO_LOCAL_DIR))
