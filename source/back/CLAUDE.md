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

## Python version

3.14, everywhere: the deployed image (`.build/Dockerfile`) and ruff's
`target-version`. Write
3.14 Python - PEP 695 type parameters (`def get_or_404[T](...)`), unquoted
forward references (PEP 649 evaluates annotations lazily), `Generator[T]`
without its defaulted `None, None` - and let `ruff check --fix` modernise
the rest. Don't add compatibility shims for older interpreters.

A system Python on a dev machine is usually older than this, and `app/`
will not even import on it (PEP 695 syntax). Make a 3.14 virtualenv and run
everything through it: `uv venv --python 3.14 .venv` (`.venv` is
gitignored), then `.venv/bin/pip install -r requirements-dev.txt`.

## Tests

`pytest` drives the API's tests, in `tests/`, against an in-memory sqlite DB
built from the models on each run - no database server, no container,
nothing left behind between runs:

```
cd source/back
.venv/bin/python -m pytest
.venv/bin/python -m ruff check .
```

It has to be a 3.14 interpreter; see "Python version" above.

Set `TEST_DATABASE_URL` to a sqlite file - `sqlite:///debug/test_env/pytest.db`
- to get a database a sqlite browser can open while debugging; it is dropped
and rebuilt at the start of each run, never at the end. It must be a sqlite
URL; conftest refuses anything else, since the fixtures depend on sqlite's
transaction handling.

Because the tests run on sqlite and production runs on postgres, they cannot
catch a postgres-only problem. That is the reason for the rule in "Test API
server (sqlite)" below: keep the models and migrations postgres-compatible,
and never reach for a sqlite-only workaround to make a test pass.

### Fixtures

`db_session` gives a session whose writes are undone when the test ends: it
joins an outer transaction that is rolled back afterwards, so a test's own
commits - and every commit an endpoint makes through `client` - land on a
savepoint rather than the database. The schema is therefore built once per
session, not per test. Note that
`client` shares that one session across the requests of a test, unlike
production where `get_session` opens and closes one per request: anything
relying on a request's transaction being discarded must roll back
explicitly rather than leaning on the session closing (see
`app/services/legacy_import.py`).

`factories` exposes every `mods.factory_db` factory, already bound to the
test's session - prefer it to driving the API just to arrange data:

```python
def test_something(client, factories):
    user = factories.UserFactory(name="Yumi")
    factories.GameFactory.create_batch(3, user=user)
```

A factory creates whatever its row requires, so `PointFactory()` also
creates the end, round, game and user above it; pass a parent
(`RoundFactory(game=game)`) to attach to an existing one, and any field to
override a default. `user` and `current_user` are shorthand for a persisted
user and for the one `client` authenticates as. `tests/test_factories.py`
covers this wiring - keep new factories working there.

Add tests with the change that needs them, and cover the error paths -
404s, rejected payloads, malformed input - not just the happy path. The
suite covers every line of `app/` bar two defensive branches; keep it that
way (`python -m pytest --cov=app --cov-report=term-missing`).

## Test API server (sqlite)

For testing archieves-api's actual behavior against the frontend (not the
pytest suite, which has its own environment - see "Tests" above),
`.build/docker-compose.yml`'s postgres container is the default. In
environments with no docker daemon (e.g. Claude Code cloud sessions -
`docker` may be present but unable to reach a daemon), use
`debug/test_env/run_test_api_server.py` instead:

```
cd source/back
.venv/bin/python debug/test_env/run_test_api_server.py
```

It must be a 3.14 interpreter (see "Python version"); a system `python3`
that is older fails on `app/`'s PEP 695 syntax before uvicorn starts.

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
