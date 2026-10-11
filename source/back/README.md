# archieves-api

FastAPI + SQLAlchemy API scaffold, designed to run as a container image on
AWS Lambda (via the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter))
behind API Gateway, backed by PostgreSQL (e.g. RDS).

## Why the Lambda Web Adapter

The app is a plain ASGI app served by `uvicorn` — no Lambda-specific
handler code (no Mangum). The adapter runs as a Lambda extension inside the
same container image, translating API Gateway events into ordinary HTTP
requests against `localhost:8080`. The same image runs identically with
`docker run` locally and on Lambda, which keeps local dev, CI, and
production on one code path.

## Project layout

```
app/
  main.py            FastAPI app instance, router wiring, exception handlers
  core/               Settings, Cognito auth, domain errors, scoring rules
  db/
    base_class.py      Declarative Base + TimestampMixin
    base.py             Imports all models for Alembic autogenerate
    session.py          Engine, SessionLocal, get_session dependency
    models/             SQLAlchemy ORM models
  schemas/             Pydantic request/response models
  crud/                DB access functions (flush only; endpoints commit)
  services/            Work spanning several tables (legacy backup import)
  api/v1/              Versioned routers
alembic/               DB migrations
tests/                 pytest + FastAPI TestClient (local PostgreSQL)
tools/                 Dev tools: `python -m tools.dev`, `tools.dump_openapi`
openapi.json           The API's OpenAPI; the frontend's types are generated from it
.build/                Build & deploy resources
  Dockerfile             Lambda container image (Lambda Web Adapter + uvicorn)
  docker-compose.yml     Local dev: api + postgres
```

`.build/` holds everything related to building and running the container
image (Dockerfile, compose files); the Docker build
context is always this directory (`..` from `.build/`), so these tools see
`app/`, `alembic/`, `requirements.txt`, etc. as usual.

## Local development

```bash
cp .env.example .env
docker compose -f .build/docker-compose.yml up --build
```

The API is then available at <http://localhost:8080> (docs at `/docs`), and
Postgres at `localhost:5432`.

Without Docker:

```bash
uv venv --python 3.14 .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # point DATABASE_URL at a local Postgres
alembic upgrade head
uvicorn app.main:app --reload
```

It has to be a 3.14 interpreter - `app/` uses PEP 695 syntax and will not
import on an older one. See .claude/docs/setup.md's "python" at the repo root.

## AWS auth: mock vs. real Cognito

Endpoints under `authenticated_router` (see `app/api/v1/api.py`) verify a
Cognito-issued bearer token by default. Set `AUTH_MODE` (see `.env.example`)
to switch:

- `AUTH_MODE=mock` (the `.env.example` and `docker-compose.yml` default) -
  skips the Cognito JWKS round-trip entirely and authenticates every request
  as the fixed `MOCK_USER_*` identity. No AWS credentials, region, or user
  pool needed - the API runs fully offline. Requests still need *an*
  `Authorization: Bearer ...` header (any value); only the token's contents
  are ignored.
- `AUTH_MODE=cognito` - the production behaviour: verifies the token against
  `USERPOOL_ID`/`APP_CLIENT_ID` in `AWS_REGION`, so a real user pool and a
  token issued by it are required.

See `app/core/security.py::get_current_user`.

## Running alongside the archieves frontend

The archieves frontend lives in the same monorepo, at
[`../front`](../front). The browser never calls this API directly: the
frontend's route handler (`src/app/api/v1/[...path]/route.ts`) forwards
`/api/v1/*` here, adding the `x-archieves-api-key` header and the signed-in
user's Cognito ID token. So no CORS is needed. When `API_KEYS` is set, requests
without one of its keys are rejected (`app/core/api_keys.py`).

The quickest way to run both is `.venv/bin/python -m tools.dev` (`--test
--seed` for a throwaway database). By hand:

1. Start this API (either `uvicorn app.main:app --reload`, which listens on
   `:8000`, or `docker compose -f .build/docker-compose.yml up`, which
   listens on `:8080`).
2. In `../front`, point `ARCHIEVES_API_URL` at it (default
   `http://127.0.0.1:8000`) and run `npm run dev` (`:3100`).
3. Keep `AUTH_MODE=mock` here in sync with `NEXT_PUBLIC_AUTH_MODE=mock` in
   `../front` (both are the default) so neither side needs real Cognito
   during local development. Flip both to `cognito`/real Amplify sandbox
   output together when you need to debug against the real auth flow.

## Migrations

```bash
alembic revision --autogenerate -m "add records table"
alembic upgrade head
```

## Tests

Against a throwaway PostgreSQL database (`archieves_test`) on the local
server that `../../infra_local/postgres.sh` starts, rebuilt by migrations on
every run, on a Python 3.14 interpreter (see .claude/docs/setup.md at the
repo root):

```bash
.venv/bin/python -m pytest
```

## Deploying to AWS

Lambda (image) functions in the RDS VPC, created by the CDK app in
[`infra/`](../../infra) and updated by GitHub Actions
(`.github/workflows/deploy-api.yml`).
