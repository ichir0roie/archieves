from factory.alchemy import SQLAlchemyModelFactory

from mods.factory_db.session import FACTORY_SESSION_PERSISTENCE, FactorySession


class BaseFactory(SQLAlchemyModelFactory):
    """Common factory_boy wiring every model factory inherits, mirroring how
    app.db.base_class.Base backs every ORM model."""

    class Meta:
        abstract = True
        sqlalchemy_session_factory = FactorySession
        sqlalchemy_session_persistence = FACTORY_SESSION_PERSISTENCE
