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

# The docker test environment (.build/docker-compose.test.yml) points this at
# its postgres, so the suite runs on the same engine production does. Left
# unset - running pytest straight off a checkout - it falls back to an
# in-memory sqlite DB, which needs no container but cannot catch a
# postgres-only problem.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")


def _make_engine() -> Engine:
    if TEST_DATABASE_URL:
        return create_engine(TEST_DATABASE_URL)
    sqlite_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
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
    DDL" in the SQLAlchemy pysqlite dialect docs. Postgres needs none of this.
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
def _schema() -> Generator[None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db_session() -> Generator[Session]:
    """A session whose writes are undone when the test ends.

    The session joins an outer transaction that is rolled back afterwards, so
    a test's own commits (and every commit an endpoint makes through the
    `client` fixture) land on a savepoint rather than the database. That keeps
    tests isolated without rebuilding the schema for each one, which matters
    on postgres where a drop/create cycle per test dominates the run.
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
