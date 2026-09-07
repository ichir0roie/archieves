from pydantic import BaseModel


class ImportResult(BaseModel):
    games: int
    rounds: int
    ends: int
    points: int
