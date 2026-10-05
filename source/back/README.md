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
  template.yaml          AWS SAM scaffold: Lambda (image) + API Gateway HTTP API
```

`.build/` holds everything related to building and running the container
image (Dockerfile, compose files, the SAM template); the Docker build
context is always the repo root (`..` from `.build/`), so these tools see
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
[`../front`](../front), and talks to this API over plain HTTP
(`src/lib/api/client.ts`), so the two just need to agree on a port and a
CORS origin - no shared network or container setup is required, each side
keeps using its own native dev server:

1. Start this API (either `uvicorn app.main:app --reload`, which listens on
   `:8000`, or `docker compose -f .build/docker-compose.yml up`, which
   listens on `:8080`).
2. In `../front`, point `NEXT_PUBLIC_API_BASE_URL` at whichever port you
   used (its `.env.example` defaults to `http://localhost:8000/api/v1` for
   the non-Docker case) and run `npm run dev` (`:3000`).
3. `BACKEND_CORS_ORIGINS` in `.env.example` is `["*"]`, so the frontend's
   origin is allowed without further changes.
4. Keep `AUTH_MODE=mock` here in sync with `NEXT_PUBLIC_AUTH_MODE=mock` in
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

`.build/template.yaml` is an AWS SAM scaffold: a `PackageType: Image`
Lambda function (built from `.build/Dockerfile`) behind an API Gateway
HTTP API, with `VpcConfig` so it can reach a PostgreSQL instance (e.g. RDS)
inside a VPC. It expects an already-provisioned database and a Secrets
Manager secret holding the `DATABASE_URL` connection string — provisioning
RDS itself is out of scope for this scaffold.

```bash
sam build -t .build/template.yaml
sam deploy --guided \
  --parameter-overrides \
    DatabaseUrlSecretArn=arn:aws:secretsmanager:...:secret:... \
    VpcSubnetIds=subnet-aaa,subnet-bbb \
    VpcSecurityGroupIds=sg-ccc
```

See the `NOTE` in `.build/template.yaml` about swapping the CloudFormation
dynamic-reference secret injection for a runtime fetch if secret rotation
matters in production.
