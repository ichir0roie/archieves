# Re-exports the whole mock layer (base factory class, session persistence
# setting, all model factories) so callers can do `from mods import
# factory_db` and reach everything as `factory_db.GameFactory`,
# `factory_db.UserFactory()`, etc. - the same shape as `from app import db`.
from mods.factory_db.base import *
from mods.factory_db.base_class import *
from mods.factory_db.session import *
