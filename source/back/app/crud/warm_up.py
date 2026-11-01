from sqlalchemy import select
from sqlalchemy.orm import Session


def ping(s: Session) -> None:
    """db に一往復だけ問い合わせる。プールに接続を作らせ、次の要求のために残させる。"""
    s.execute(select(1))
