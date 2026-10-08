import os

from tools import testing_db

# app.* を import する前に、db とログインの向け先を固定する(どちらも import した時に読まれる)。
# 手元の .env の AUTH_MODE=mock に引きずられると、ログインを確かめるテストが落ちる
TEST_DATABASE_URL = testing_db.pin("archieves_test")
os.environ["AUTH_MODE"] = "cognito"

from collections.abc import Generator  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import event  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from app.api import deps  # noqa: E402
from app.core.security import Claims  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402
from mods import factory_db  # noqa: E402

TEST_CLAIMS = Claims(sub="test-user-sub", username="testuser", email="test@example.com")

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False)


@pytest.fixture(scope="session", autouse=True)
def _schema() -> None:
    """回すたびに archieves_test を空で作り直し、マイグレーションで本番と同じ表を作る。

    終わったあとは消さないので、落ちたテストの後でも psql で表を覗ける(行は各テストが巻き戻す)。
    """
    engine.dispose()
    testing_db.recreate_database(TEST_DATABASE_URL)
    testing_db.upgrade_head(TEST_DATABASE_URL)


@pytest.fixture()
def s() -> Generator[Session]:
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
def unregistered_client(s: Session) -> Generator[TestClient]:
    """ログインはしているが、本人の `users` の行がまだ無い状態の client。"""

    # テストでは要求をまたいで同じセッションを使うので、コミットし忘れた書き込みも
    # 次の要求から見えてしまう。書いたのにコミットせずに返した要求をここで落とす
    def _flushed(session: Session, flush_context: object) -> None:
        session.info["uncommitted"] = True

    def _settled(session: Session, *_: object) -> None:
        session.info["uncommitted"] = False

    event.listen(s, "after_flush", _flushed)
    event.listen(s, "after_commit", _settled)
    event.listen(s, "after_soft_rollback", _settled)

    def _get_session_override() -> Generator[Session]:
        s.info["uncommitted"] = False
        yield s
        assert not s.info["uncommitted"], "書き込んだのにコミットせずに応答した"

    app.dependency_overrides[deps.get_session] = _get_session_override
    app.dependency_overrides[deps.get_current_user] = lambda: TEST_CLAIMS
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def client(unregistered_client: TestClient, current_user) -> TestClient:
    """本人の行がある状態の client(「本人のみ」のエンドポイントは本人の行を引く)。"""
    return unregistered_client


@pytest.fixture()
def factories(s: Session):
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
def current_user(factories):
    """The user `client`'s requests authenticate as (see TEST_CLAIMS)."""
    return factories.UserFactory(sub=TEST_CLAIMS.sub, name="Yumi")


@pytest.fixture()
def user(current_user):
    """One persisted user, for the many tests that just need an owner.

    「本人のみ」のエンドポイントは本人の行しか通さないので、`client` で操作する行の持ち主は
    この利用者(`current_user` と同じ)にする。他人が要るテストは `factories.UserFactory()` で作る。
    """
    return current_user
