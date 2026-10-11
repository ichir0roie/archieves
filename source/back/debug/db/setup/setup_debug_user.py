from sqlalchemy import select, update

from app.core.config import debug_settings
from app.db import *
from mods.factory_db import *


def make_admin(sub: str) -> None:
    """sub の利用者の行があれば管理者にする(意見箱の確認の画面を手元で見られるように)。

    モックの利用者の行は create_debug_user のほか、画面の登録(/users/me/ensure)でも作られ、
    そちらは管理者にならない。tools/dev.py が起こすたびにこれで付け直す。
    """
    FactorySession.execute(update(User).where(User.sub == sub).values(is_admin=True))
    FactorySession.commit()


def create_debug_user() -> User:
    """モックの利用者。無ければ作り、管理者にする。"""
    sub = debug_settings.MOCK_USER_SUB
    debug_user = FactorySession.scalar(select(User).where(User.sub == sub))
    if debug_user is None:
        debug_user = UserFactory.create(
            name=debug_settings.MOCK_USER_USERNAME,
            nickname=debug_settings.MOCK_USER_USERNAME,
            sub=sub,
        )
    make_admin(sub)
    return debug_user
