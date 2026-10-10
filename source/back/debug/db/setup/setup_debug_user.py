from sqlalchemy import select

from app.core.config import debug_settings
from app.db import *
from mods.factory_db import *


def create_debug_user(
) -> User:
    """Create a mock user for debugging purposes.

    モックの利用者は管理者にする(意見箱の確認の画面を手元で見られるように)。
    """
    debug_user = FactorySession.scalar(
        select(User).where(
            User.sub == debug_settings.MOCK_USER_SUB
        )
    )
    if not debug_user:
        debug_user = UserFactory.create(
            name=debug_settings.MOCK_USER_USERNAME,
            nickname=debug_settings.MOCK_USER_USERNAME,
            sub=debug_settings.MOCK_USER_SUB,
            is_admin=True,
        )
        FactorySession.commit()
    elif not debug_user.is_admin:
        debug_user.is_admin = True
        FactorySession.commit()
    return debug_user
