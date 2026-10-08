import sys
from pathlib import Path

# VSCode のデバッグ構成からではなくシェルから直に回すので、cwd がどこでも app.* を読めるようにする
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import argparse  # noqa: E402
import logging  # noqa: E402
import os  # noqa: E402

from tools import testing_db  # noqa: E402

logger = logging.getLogger("debug.test_env.run_test_api_server")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="E2E・画面の確かめ用に、空のテスト用の db に向けた API を起こす",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8080,
    )
    parser.add_argument(
        "--db",
        default="archieves_test_api",
        help="手元の PostgreSQL に作る db の名前(archieves_test で始める)",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")

    # pytest(archieves_test)と並べて回しても、互いの表を作り直さないよう db を分ける
    url = testing_db.pin(args.db)
    os.environ["AUTH_MODE"] = "mock"
    testing_db.recreate_database(url)
    testing_db.upgrade_head(url)
    logger.info(f"{args.db} に向けて :{args.port} で起こす")

    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
