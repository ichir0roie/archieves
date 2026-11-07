"""試合の id(参加のコード)。

人が読み上げ・打ち写しして共有するので、見分けにくい字(0/O・1/I/L)を外す。
"""

import secrets

MATCH_ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
# 31 字 × 8 桁で約 8.5 × 10^11 通り。当てずっぽうで入れる見込みは無い
MATCH_ID_LENGTH = 8


def new_match_id() -> str:
    return "".join(secrets.choice(MATCH_ID_ALPHABET) for _ in range(MATCH_ID_LENGTH))
