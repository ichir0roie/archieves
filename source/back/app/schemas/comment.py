from pydantic import BaseModel, Field

from app.core.comments import MAX_COMMENT_LENGTH
from app.schemas.base import ResponseModel


class CommentBase(BaseModel):
    """The only field a comment carries of its own; every comment read model
    adds just its own id/owner/parent columns on top."""

    body: str = Field(min_length=1, max_length=MAX_COMMENT_LENGTH)


class CommentWrite(CommentBase):
    pass


class CommentRead(CommentBase, ResponseModel):
    id: int
    user_id: int


class GameCommentRead(CommentRead):
    game_id: int


class RoundCommentRead(CommentRead):
    round_id: int


class EndCommentRead(CommentRead):
    end_id: int


class GameComments(ResponseModel):
    """Every comment under one game, for screens that draw the whole sheet."""

    game: GameCommentRead | None = None
    rounds: list[RoundCommentRead] = []
    ends: list[EndCommentRead] = []
