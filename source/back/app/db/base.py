# Imported by Alembic (see alembic/env.py) and by app.db's __init__ so every
# model is registered on Base.metadata before autogenerate/create_all inspects it.
# Add new models here as they're created.

from app.db.base_class import Base  # noqa: F401
from app.db.models.access_token_model import AccessToken  # noqa: F401
from app.db.models.comment_model import (  # noqa: F401
    EndComment,
    GameAiComment,
    GameComment,
    RoundComment,
)
from app.db.models.diary_model import Diary  # noqa: F401
from app.db.models.game_model import End, Game, Point, Round  # noqa: F401
from app.db.models.support_model import Announcement, ErrorReport, Feedback  # noqa: F401
from app.db.models.system_model import Organization, Region, User  # noqa: F401
