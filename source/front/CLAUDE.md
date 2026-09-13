# archieves

共通の規約（コメントの書き方、1行1要素、応答の書き方）とテスト・ブランチ・PRの
運用は [`../../CLAUDE.md`](../../CLAUDE.md) を参照。ここにはフロントエンド固有の
ことだけを書く。

## E2E tests

Playwright (`@playwright/test`) drives frontend e2e tests, in `e2e/`.
Run them with `npm run test:e2e` (`npm run test:e2e:ui`, or
`npm run test:e2e -- --ui`, to debug interactively).

`playwright.config.ts`'s `webServer` starts `npm run dev` itself and
forces `NEXT_PUBLIC_AUTH_MODE=mock` (plus the matching mock-user vars) on
that process, so tests never need a real Cognito sign-in or a
hand-written `.env.local`.

It does *not* set `NEXT_PUBLIC_API_BASE_URL`, and every spec starts from
`ensureRegistered(page)`, which loads `/profile/settings` and therefore
talks to archieves-api. So the suite needs a running backend on the port
you point that variable at - the built-in default is `:8000`, while both
backends below serve `:8080`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1 npm run test:e2e
```

For the backend itself, from `../back`:

- No docker daemon (e.g. Claude Code cloud sessions):
  `.venv/bin/python debug/test_env/run_test_api_server.py` - it serves the
  same API on `:8080` against a disposable sqlite DB, rebuilt on each
  start. It needs a Python 3.14 interpreter, which is what that venv is
  for. See `../back/CLAUDE.md`'s "Python version" and "Test API server
  (sqlite)" sections.
- With docker (local development):
  `docker compose -f .build/docker-compose.yml up -d`, which serves the
  same `:8080` against postgres. See this app's own `README.md`, "Running
  alongside archieves-api", for the env-var pairing this mirrors.

`webServer.reuseExistingServer` is on outside CI, so a dev server that is
already up is reused as-is and a newly exported
`NEXT_PUBLIC_API_BASE_URL` will not reach it. Stop that dev server after
changing which API the tests should hit.

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

That headroom is not always enough on the very first run against an empty
`.next`, where the whole suite compiles in parallel: a spec that visits
several routes in one test (`navigation.spec.ts`) can still stall on a
`読み込み中...` page past its own timeout. Before treating such a failure
as a regression, re-run it on the now-warm cache - a genuine break fails
again. Don't raise the timeouts further for this.

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
