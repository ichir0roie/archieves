# archieves

## Conventions

Shared with the [../back](../back) backend:

- Don't write comments in code.
- Put each element on its own line (e.g. each JSX prop, each array/object
  entry, each function argument).
- Skip the end-of-turn summary in chat responses.

## E2E tests

Playwright (`@playwright/test`) drives frontend e2e tests, in `e2e/`.
Run them with `npm run test:e2e` (add `-- --ui` /
`npm run test:e2e:ui` to debug interactively).

`playwright.config.ts`'s `webServer` starts `npm run dev` itself and
forces `NEXT_PUBLIC_AUTH_MODE=mock` (plus the matching mock-user vars) on
that process, so tests never need a real Cognito sign-in or a
hand-written `.env.local`. Pages that don't call archieves-api work
against that alone. For pages/flows that do need real data, start the
backend first (from `../back`): `docker compose -f .build/docker-compose.yml
up -d`, then set
`NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1` when running
`npm run test:e2e` (matching the "Running alongside archieves-api"
section above).

In environments with no docker daemon (e.g. Claude Code cloud sessions),
run `python debug/test_env/run_test_api_server.py` from `../back` instead -
it serves the same API on the same `:8080` port against a disposable
sqlite DB, so `NEXT_PUBLIC_API_BASE_URL` is set the same way. See
`../back/CLAUDE.md`'s "Test API server (sqlite)" section.

`@playwright/test` is pinned to `1.56.0` (not a `^` range) because
Claude Code's cloud sessions ship Chromium build 1194 pre-installed at
`/opt/pw-browsers` and only that exact `@playwright/test` version's
bundled Chromium revision matches it - `npx playwright install` is
unnecessary there, and bumping the pin requires re-checking that the
container's pre-installed browser revision still matches (see
`playwright-core`'s `browsers.json` in the target version). Outside
that environment (local debugging), run `npx playwright install
chromium` once after `npm install` if the browser isn't already
present.

## Pull requests

When a task's changes are committed and pushed to a branch, open a pull
request for that branch against `develop` as part of finishing the task -
do this every time, without waiting to be asked.
