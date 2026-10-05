from tools import dump_openapi


def test_committed_openapi_matches_the_app() -> None:
    # フロントの型(src/lib/api/openapi.d.ts)は openapi.json から作るので、
    # API を変えたら両方を作り直す
    committed = dump_openapi.OPENAPI_PATH.read_text(encoding="utf-8")
    assert committed == dump_openapi.render(), (
        "openapi.json が古い。.venv/bin/python -m tools.dump_openapi と、"
        "source/front で npm run types を回す"
    )
