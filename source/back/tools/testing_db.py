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


def _alembic_config(url: str):
    from alembic.config import Config

    config = Config(str(BACK_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACK_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


def upgrade_head(url: str) -> None:
    """url の db にマイグレーションを head まで流す。

    本番と同じ表をテストでも使うため create_all にはしない。
    """
    from alembic import command

    command.upgrade(_alembic_config(url), "head")


def _is_at_head(url: str) -> bool:
    """url の db があり、マイグレーションのバージョンが今のコードの head と同じなら True。"""
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory
    from sqlalchemy.exc import OperationalError

    heads = set(ScriptDirectory.from_config(_alembic_config(url)).get_heads())
    engine = create_engine(url)
    try:
        with engine.connect() as c:
            current = set(MigrationContext.configure(c).get_current_heads())
    except OperationalError:
        # db がまだ無い
        return False
    finally:
        engine.dispose()
    return current == heads


def prepare_database(url: str, reset: bool = False) -> bool:
    """url の db を、今のマイグレーションの表で使える状態にする。作り直したら True。

    バージョンが head と同じなら、行ごと残して使い回す(作り直すと、手で足した行や乱数の行が消える)。
    無い・バージョンが違う(マイグレーションを足した・ブランチを替えた)・reset のときだけ、
    消して作り直す。
    同じバージョンのまま中身を書き換えたマイグレーションは見分けられないので、そのときは reset する
    """
    name = make_url(url).database
    if not reset and _is_at_head(url):
        logger.info(f"{name} はマイグレーションが最新なので、作り直さずに使う")
        return False
    recreate_database(url)
    upgrade_head(url)
    return True
