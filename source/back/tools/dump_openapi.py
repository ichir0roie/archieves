"""API の OpenAPI を openapi.json に書き出す。フロントの型(npm run types)はここから作る。

    .venv/bin/python -m tools.dump_openapi

本番と同じ形で書き出すため、ログインを確かめる形(AUTH_MODE=cognito)で app を読む。
tests/test_openapi.py が、書き出したものと今の app の食い違いを落とす。
"""

import json
import os
from pathlib import Path

OPENAPI_PATH = Path(__file__).resolve().parent.parent / "openapi.json"


def render() -> str:
    os.environ["AUTH_MODE"] = "cognito"
    from app.main import app

    return json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    OPENAPI_PATH.write_text(render(), encoding="utf-8")
    print(OPENAPI_PATH)


if __name__ == "__main__":
    main()
