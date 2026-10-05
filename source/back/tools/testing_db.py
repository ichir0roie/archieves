"""テスト・デバッグで使う db を、手元の PostgreSQL(infra_local/postgres.sh)の中に固定する。

app.* を import する前に pin() を呼ぶ。app.core.config は import した時に DATABASE_URL を
読んで engine を作るので、後から差し替えても効かない。本番の db に向けたまま
テストの drop / create が走らないよう、向け先は手元のサーバーの決まった名前の db だけに限る。
"""

import logging
import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

logger = logging.getLogger(__name__)

BACK_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACK_DIR.parent.parent
LOCAL_HOSTS = {"127.0.0.1", "localhost"}


def dev_server_url() -> str:
    """開発用の db(archieves_dev)の URL。

    ARCHIEVES_DEV_DATABASE_URL が無ければ infra_local/postgres.sh で用意する。
    """
    url = os.environ.get("ARCHIEVES_DEV_DATABASE_URL")
    if url:
        return url
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "infra_local" / "postgres.sh"), sys.executable],
        check=True,
        capture_output=True,
        text=True,
    )
    url = result.stdout.strip().splitlines()[-1]
    os.environ["ARCHIEVES_DEV_DATABASE_URL"] = url
    return url


def database_url(name: str) -> str:
    """開発用の db と同じサーバーにある、name の db の URL。"""
    if not name.startswith("archieves_test"):
        raise ValueError(f"テスト用の db の名前は archieves_test で始める: {name}")
    url = make_url(dev_server_url())
    if url.host not in LOCAL_HOSTS:
        raise RuntimeError(f"テスト用の db が手元の PostgreSQL を指していない: {url.host}")
    return url.set(database=name).render_as_string(hide_password=False)


def pin(name: str) -> str:
    """DATABASE_URL を name のテスト用の db に固定して、その URL を返す。"""
    if "app.db.session" in sys.modules:
        raise RuntimeError(
            "app.db.session がテスト用の db 以外で先に読み込まれている。pin() を先に呼ぶ"
        )
    url = database_url(name)
    os.environ["DATABASE_URL"] = url
    return url


def recreate_database(url: str) -> None:
    """url の db を消して空で作り直す。"""
    target = make_url(url)
    admin = create_engine(target.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'DROP DATABASE IF EXISTS "{target.database}" WITH (FORCE)'))
        c.execute(text(f'CREATE DATABASE "{target.database}" ENCODING \'UTF8\''))
    admin.dispose()
    logger.info(f"{target.database} を作り直した")


def upgrade_head(url: str) -> None:
    """url の db にマイグレーションを head まで流す。

    本番と同じ表をテストでも使うため create_all にはしない。
    """
    from alembic.config import Config

    from alembic import command

    config = Config(str(BACK_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACK_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    command.upgrade(config, "head")
