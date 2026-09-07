from sqlalchemy.orm import scoped_session

from app.core.config import debug_settings
from app.db.session import SessionLocal

# "flush" or "commit" (see DebugSettings.FACTORY_SESSION_PERSISTENCE); read
# once at import time, same as every other setting in this codebase.
FACTORY_SESSION_PERSISTENCE = debug_settings.FACTORY_SESSION_PERSISTENCE

# factory_boy calls its session factory once per *factory class* the first
# time that class needs a session. A plain sessionmaker would then hand
# nested SubFactory chains (e.g. PointFactory -> EndFactory -> RoundFactory
# -> GameFactory -> UserFactory) a different Session each, and SQLAlchemy
# rejects attaching a related object that already belongs to another
# session. scoped_session makes every one of those calls return the same
# thread-local Session instead, so a whole factory call tree shares one
# transaction.
FactorySession = scoped_session(SessionLocal)
