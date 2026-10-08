"""マイグレーションだけを流す Lambda(archieves-migrate)の口。

API と同じイメージを、コマンドだけ差し替えて動かす(infra/lib/api-stack.ts)。Lambda Web Adapter は、
HTTP でない呼び出し(CI の `aws lambda invoke`)を `POST /events` として流し、その応答をそのまま
呼び出しの結果として返す。db へは表の持ち主のロール(`archieves_migrator`。
infra/sql/archieves_roles.sql)で、IAM データベース認証で繋ぐ。
呼び出しの中身は見ず、イメージに入っているバージョンまで `alembic upgrade head` を流すだけにする
(任意の SQL は受けない)。
"""

import logging
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import FastAPI
from pydantic import BaseModel

from alembic import command
from app.db.session import engine

logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent

app = FastAPI()


class MigrationResult(BaseModel):
    before: str | None
    after: str | None
    head: str | None


def _current() -> str | None:
    with engine.connect() as connection:
        return MigrationContext.configure(connection).get_current_revision()


# Lambda Web Adapter が起動を確かめる道(イメージの AWS_LWA_READINESS_CHECK_PATH)
@app.get("/api/v1/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/events")
def migrate() -> MigrationResult:
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "alembic"))
    before = _current()
    command.upgrade(config, "head")
    result = MigrationResult(
        before=before,
        after=_current(),
        head=ScriptDirectory.from_config(config).get_current_head(),
    )
    logger.info(f"マイグレーション: {result.before} → {result.after}(head={result.head})")
    return result
