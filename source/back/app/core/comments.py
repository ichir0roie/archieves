"""Free-text notes a player can attach to a game, a round or an end.

One comment per entity: saving again updates the row that is already there
rather than adding a second note, so every screen can show "the" comment of
a game/round/end without having to pick one.
"""

MAX_COMMENT_LENGTH = 1000
