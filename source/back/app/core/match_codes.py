"""試合の id(参加のコード)。

「開催日-作った人の id-試合の番号-ランダムな 8 字」(例 20261107-12-345-AB3CD7EF)。
試合の番号は db の連番(matches_number_seq)から取るので、コードは作りの上で重ならない。
ランダムな字は、番号を一つずつ試して他人の試合に入られないために付ける。
人が読み上げ・打ち写しもするので、見分けにくい字(0/O・1/I/L)は使わない。
"""

import secrets
from datetime import datetime

from app.core.timezone import JST

MATCH_ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
MATCH_ID_RANDOM_LENGTH = 8
# 列の長さ。日付 8 字・区切り 3 字・ランダム 8 字に、id と番号の桁を足しても十分に収まる
MATCH_ID_MAX_LENGTH = 64


def new_match_id(held_at: datetime, organizer_id: int, number: int) -> str:
    day = held_at.astimezone(JST).strftime("%Y%m%d")
    random_part = "".join(secrets.choice(MATCH_ID_ALPHABET) for _ in range(MATCH_ID_RANDOM_LENGTH))
    return f"{day}-{organizer_id}-{number}-{random_part}"
