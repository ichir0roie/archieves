from app.schemas.base import ResponseModel


class ImportResult(ResponseModel):
    games: int
    rounds: int
    ends: int
    points: int
