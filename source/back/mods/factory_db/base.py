# Imported by mods.factory_db's __init__ so every factory is registered in
# one place, mirroring how app.db.base imports every model for Alembic.
from mods.factory_db.base_class import *  # noqa: F401
from mods.factory_db.models import (  # noqa: F401
    EndFactory,
    GameFactory,
    MatchFactory,
    OrganizationFactory,
    PointFactory,
    RegionFactory,
    RoundFactory,
    UserFactory,
)
