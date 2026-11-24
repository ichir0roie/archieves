"""写真モードの写真の決まり。"""

from enum import StrEnum


class PhotoStatus(StrEnum):
    # 行を作り、ブラウザが元の写真・表示の画像を置き場へ送って、処理の結果を書くのを待っている
    UPLOADING = "uploading"
    PROCESSED = "processed"
    # 写真を読めなかった。API が写真を処理していたころの行だけにある
    # (今はブラウザが読めない写真を送らない)
    FAILED = "failed"


# 受ける写真の形式と、置き場のキーに付ける拡張子。
# iPhone の HEIC はフロントが JPEG に直してから送る
PHOTO_EXTENSIONS: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

# 元の写真の大きさの上限。スマホの写真(12〜48MP の JPEG)が収まる程度
PHOTO_MAX_BYTES = 30 * 1024 * 1024
# 表示の画像(ブラウザが作る、長辺 2000px の JPEG)の大きさの上限
PHOTO_DISPLAY_MAX_BYTES = 8 * 1024 * 1024
# 推測した矢の数の上限(1 エンドの矢の数より多めに受け、画面が本数で切る)
PHOTO_MAX_ESTIMATES = 24
# 写真の大きさ(px)の上限。ありえない値で db を埋めない
PHOTO_MAX_PIXELS_PER_SIDE = 100_000
# 処理のバージョンの長さ(db の列と同じ)
ANALYZER_VERSION_MAX_LENGTH = 32
