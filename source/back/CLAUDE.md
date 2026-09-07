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
