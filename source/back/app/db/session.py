from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def iam_auth_token(host: str, port: int, user: str) -> str:
    """IAM データベース認証のトークン(15 分有効)。署名は手元で行い、AWS へは通信しない。"""
    import boto3  # 手元・テストでは使わないので、使うときに読む

    return boto3.client("rds", region_name=settings.AWS_REGION).generate_db_auth_token(
        DBHostname=host,
        Port=port,
        DBUsername=user,
    )


def inject_iam_token(dialect, conn_rec, cargs, cparams) -> None:
    """`do_connect` で、DB_IAM_AUTH のときだけパスワードをトークンに差し替える。

    プールが接続を作り直すたびに新しいトークンを入れる(古いトークンは切れている)。
    """
    if not settings.DB_IAM_AUTH:
        return
    cparams["password"] = iam_auth_token(cparams["host"], int(cparams["port"]), cparams["user"])
    cparams.setdefault("sslmode", "require")


engine = create_engine(
    settings.DATABASE_URL,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=settings.DB_POOL_PRE_PING,
)
event.listen(engine, "do_connect", inject_iam_token)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_session() -> Generator[Session]:
    with SessionLocal() as s:
        yield s
