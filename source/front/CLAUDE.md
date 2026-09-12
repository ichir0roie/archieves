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

Every page nests `AuthGate`, which bounces a user with no archieves-api
row to `/profile/settings`. Start each spec from `ensureRegistered(page)`
(see `e2e/ensureRegistered.ts`) or the navigation under test will land
there instead. `e2e/recordGame.ts` records and finishes one game, for the
pages that need this user to already have data (score log, statistics,
ranking, match registration).

Specs run fully parallel against one shared API database, so assert on
what the test itself created (a returned game id, a unique name) rather
than on totals or row counts that another spec can move.

`playwright.config.ts` raises the test timeout to 120s and the expect
timeout to 15s: Turbopack dev-compiles each route on its first visit, so a
spec that walks several routes spends most of its budget compiling, and
the defaults (30s / 5s) time out on a cold `.next` cache even when nothing
is wrong.

When a spec needs to address an element there is no role or text for, add
a semantic class to the component (`.ScoreLogGame`, `.MatchRow`,
`.ScoreSheet`) and select on that, matching what the existing specs do.

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
