# archieves-api

## Conventions

Shared with the [../front](../front) frontend:

- Don't write comments in code.
- Put each element on its own line (e.g. each list/dict entry, each function
  argument).
- Skip the end-of-turn summary in chat responses.

## DB session handling

Open a `Session` with `with SessionLocal() as db:` rather than a manual
`db = SessionLocal(); try: ... finally: db.close()`. `Session` implements
the context manager protocol itself (see SQLAlchemy's ORM Session Basics
docs), and `close()` already rolls back any uncommitted transaction — so
there's no need for a separate `except Exception: db.rollback()` either.
Commit explicitly on success inside the `with` block; let `with` handle
cleanup (and implicit rollback) on exceptions.

## Tests

`pytest` drives the API's tests, in `tests/`. Install the dev dependencies
once (`pip install -r requirements-dev.txt`), then run them from this
directory:

```
python -m pytest
python -m ruff check .
```

`tests/conftest.py` gives each test a fresh in-memory sqlite DB and a
`TestClient` whose `get_session`/`get_current_user` dependencies are
overridden, so no postgres, no Cognito and no network are needed. Use the
`client` fixture for endpoint tests and `db_session` for CRUD/service ones.

Add tests with the change that needs them, and cover the error paths -
404s, rejected payloads, malformed input - not just the happy path. The
suite currently covers every line of `app/` bar two defensive branches;
keep it that way (`python -m pytest --cov=app --cov-report=term-missing`,
needs `pytest-cov`).

Note that `client` shares one session across the requests of a test, unlike
production where `get_session` opens and closes one per request. Anything
relying on a request's transaction being discarded must roll back
explicitly rather than leaning on the session closing (see
`app/services/legacy_import.py`).

Ruff's `target-version` is the *lowest* interpreter the code must run on
(`py311`), not the deployed one (3.14, see `.build/Dockerfile`): dev
containers ship older Pythons, and fixes that assume 3.12+/3.14 semantics
(PEP 695 generics, PEP 649 deferred annotations, `Generator`'s defaulted
type arguments) break the suite there.

## Test API server (sqlite)

For testing archieves-api's actual behavior against the frontend (not unit
tests, which already run against an in-memory sqlite DB per
`tests/conftest.py`), `.build/docker-compose.yml`'s postgres container is
the default. In environments with no docker daemon (e.g. Claude Code cloud
sessions - `docker` may be present but unable to reach a daemon), use
`debug/test_env/run_test_api_server.py` instead:

```
cd source/back
python debug/test_env/run_test_api_server.py
```

Each run: deletes `debug/test_env/test.db` (gitignored) if present, rebuilds
the schema into that empty file via `debug/db/create_db.py`
(`Base.metadata.create_all`, the same path the unit tests exercise), then
serves `app.main:app` on `http://0.0.0.0:8080` with `AUTH_MODE=mock` -
matching the port the frontend's `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1`
convention already expects (see `../front/CLAUDE.md`'s E2E tests section).
Always start from this fresh rebuild rather than reusing a stale
`test.db` between test runs.

This script is test-only tooling and lives under `debug/`, separate from
`app/` and `alembic/`. Keep the SQLAlchemy model and migration definitions
themselves postgres-compatible - don't special-case them for sqlite (no
`postgresql`-dialect-only column types, no sqlite-only workarounds in
`app/db/models/`). Migrations already use `op.batch_alter_table` for
sqlite-compatible ALTERs; dialect-specific kwargs like
`postgresql_using=` are simply ignored on other dialects, so nothing further
is needed there.

If a fresh environment fails to start uvicorn with a `_cffi_backend`
import error from `cryptography`, run `pip install cffi` once - it's a
missing transitive dependency of the preinstalled system `cryptography`
package in some containers, not a project dependency.

## Debug scripts

Scripts under `debug/` (e.g. `debug/db/create_db.py`,
`debug/db/randmize/random_all_data.py`) are always launched via a VSCode
debug configuration whose working directory is already the project root, so
`app.*` and `mods.*` imports resolve without help. Don't add
`PROJECT_ROOT`/`sys.path.insert` boilerplate to these scripts - import
`app`/`mods` modules directly at the top of the file.

## Pull requests

When a task's changes are committed and pushed to a branch, open a pull
request for that branch against `develop` as part of finishing the task -
do this every time, without waiting to be asked.
