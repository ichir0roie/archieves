"""利用者が発行して Claude Code などに渡す、本人の記録を読むだけのトークン。

平文は発行したときに一度だけ返し、db には sha256 だけを置く。推測できない長さの乱数なので、
パスワードのような遅いハッシュは要らない。
"""

import hashlib
import secrets

# 見ればこのアプリのトークンと分かるよう、頭に付ける(漏れたときに探しやすい)
TOKEN_PREFIX = "arc_"
# 一覧で見分けるために残す、平文の頭の長さ(TOKEN_PREFIX を含む)
DISPLAY_PREFIX_LENGTH = 8
MAX_NAME_LENGTH = 50
MAX_TOKENS_PER_USER = 10
DEFAULT_EXPIRES_IN_DAYS = 90
MAX_EXPIRES_IN_DAYS = 365


def generate_token() -> str:
    return TOKEN_PREFIX + secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
