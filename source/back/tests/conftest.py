import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Connection, Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import deps
from app.core.security import Claims
from app.db.base import Base
from app.main import app
from mods import factory_db

TEST_CLAIMS = Claims(sub="test-user-sub", username="testuser", email="test@example.com")

# The suite runs on sqlite, in memory by default: no server, no container
# state, and a schema rebuilt from the models on every run. Point
# TEST_DATABASE_URL at a sqlite file (e.g. "sqlite:///debug/test_env/pytest.db")
# to get a database a sqlite browser can open while debugging a test - it
# holds the schema, but no rows outlive the test that made them (see
# db_session). It must be a sqlite URL: the fixtures below depend on sqlite's
# transaction handling.
DEFAULT_TEST_DATABASE_URL = "sqlite:///:memory:"
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "") or DEFAULT_TEST_DATABASE_URL

if not TEST_DATABASE_URL.startswith("sqlite"):
    raise RuntimeError(
        f"TEST_DATABASE_URL must be a sqlite URL, got {TEST_DATABASE_URL!r}. "
        "The tests run on sqlite; see CLAUDE.md's Tests section."
    )


def _make_engine() -> Engine:
    is_memory = ":memory:" in TEST_DATABASE_URL
    sqlite_engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        # An in-memory DB lives inside its connection, so every checkout has to
        # be the same one or the schema vanishes between them. A file-backed
        # one needs no such pinning.
        poolclass=StaticPool if is_memory else None,
    )
    _enable_sqlite_savepoints(sqlite_engine)
    return sqlite_engine


def _enable_sqlite_savepoints(sqlite_engine: Engine) -> None:
    """Make SAVEPOINT work on sqlite, which `db_session` relies on to undo a
    test's writes.

    pysqlite opens its own transaction implicitly and does not emit BEGIN
    before a SAVEPOINT, so nested rollbacks silently do nothing and one
    test's committed rows stay visible to the next. SQLAlchemy's documented
    fix is to take transaction control away from the driver and emit BEGIN
    from here instead - see "Serializable isolation / Savepoints / Transactional
    DDL" in the SQLAlchemy pysqlite dialect docs.
    """

    @event.listens_for(sqlite_engine, "connect")
    def _disable_driver_transactions(dbapi_connection, connection_record) -> None:
        dbapi_connection.isolation_level = None

    @event.listens_for(sqlite_engine, "begin")
    def _emit_begin(conn: Connection) -> None:
        conn.exec_driver_sql("BEGIN")


engine = _make_engine()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False)


@pytest.fixture(scope="session", autouse=True)
def _schema() -> None:
    """Build the schema once, from the models, for the whole run.

    Dropping first is what makes a file-backed TEST_DATABASE_URL safe to reuse;
    nothing is dropped afterwards, so that file can still be opened once the
    run has finished.
    """
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


@pytest.fixture()
def db_session() -> Generator[Session]:
    """A session whose writes are undone when the test ends.

    The session joins an outer transaction that is rolled back afterwards, so
    a test's own commits (and every commit an endpoint makes through the
    `client` fixture) land on a savepoint rather than the database. That keeps
    tests isolated without rebuilding the schema for each one.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(
        bind=connection,
        join_transaction_mode="create_savepoint",
    )
    factory_db.FactorySession.registry.set(session)
    try:
        yield session
    finally:
        factory_db.FactorySession.registry.clear()
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient]:
    def _get_db_override() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[deps.get_session] = _get_db_override
    app.dependency_overrides[deps.get_current_user] = lambda: TEST_CLAIMS
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def factories(db_session: Session):
    """Every factory_boy factory, already bound to this test's session.

    Use it to build the rows a test needs directly, instead of driving the
    API to create them:

        user = factories.UserFactory(name="Yumi")
        point = factories.PointFactory(score=10)

    A factory creates whatever its row requires, so `PointFactory()` also
    creates the end, round, game and user above it. Pass a parent explicitly
    (`factories.RoundFactory(game=game)`) to attach to an existing one.
    """
    return factory_db


@pytest.fixture()
def user(factories):
    """One persisted user, for the many tests that just need an owner."""
    return factories.UserFactory()


@pytest.fixture()
def current_user(factories):
    """The user `client`'s requests authenticate as (see TEST_CLAIMS)."""
    return factories.UserFactory(sub=TEST_CLAIMS.sub)
