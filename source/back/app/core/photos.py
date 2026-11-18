"""写真モードの写真の決まり。"""

from enum import StrEnum


class PhotoStatus(StrEnum):
    # 行を作り、ブラウザが元の写真を置き場へ送るのを待っている
    UPLOADING = "uploading"
    PROCESSED = "processed"
    # 写真を読めなかった。撮り直してもらう
    FAILED = "failed"


# 受ける写真の形式と、置き場のキーに付ける拡張子。Pillow で読めるものだけ。
# iPhone の HEIC はフロントが JPEG に直してから送る
PHOTO_EXTENSIONS: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

# 元の写真の大きさの上限。スマホの写真(12〜48MP の JPEG)が収まり、壊れたファイルで Lambda の
# メモリを使い切らない程度
PHOTO_MAX_BYTES = 30 * 1024 * 1024
