from app.core.config import Settings


def test_database_url_is_built_from_the_db_parts_when_unset() -> None:
    # _env_file は pydantic-settings が受ける引数だが、型の上では Settings の欄に無い
    settings = Settings(
        _env_file=None,  # pyright: ignore[reportCallIssue]
        DATABASE_URL="",
        DB_DRIVER="postgresql+psycopg2",
        DB_USER="archer",
        DB_PASSWORD="p@ss word",
        DB_HOST="db.example",
        DB_PORT=5433,
        DB_NAME="archieves",
    )
    assert settings.DATABASE_URL == (
        "postgresql+psycopg2://archer:p%40ss+word@db.example:5433/archieves"
    )


def test_database_url_set_directly_wins_over_the_db_parts() -> None:
    settings = Settings(
        _env_file=None,  # pyright: ignore[reportCallIssue]
        DATABASE_URL="postgresql+psycopg2://u:p@elsewhere/other",
        DB_HOST="db.example",
    )
    assert settings.DATABASE_URL == "postgresql+psycopg2://u:p@elsewhere/other"
