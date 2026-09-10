from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.scoring import max_score_for_ring_count
from app.core.target_types import get_target_type
from app.crud import game as game_crud
from app.db import End
from app.schemas.game import (
    EndCreate,
    EndRead,
    EndUpdate,
    GameCreate,
    GameRead,
    GameUpdate,
    MatchCreate,
    MatchRead,
    MatchSummary,
    MatchUpdate,
    PointCreate,
    PointRead,
    PointUpdate,
    RoundCreate,
    RoundRead,
    RoundUpdate,
)

router = APIRouter()


def _check_score_fits_target(db: Session, end: End, score: int) -> None:
    """Reject a score the round's target face can't produce - an X (11) on a
    10-ring compound face, say. Rounds whose target_type predates the fixed
    list (legacy imports) have no known ring count, so nothing to check."""
    round_ = game_crud.get_round(db, end.round_id)
    if round_ is None:
        return
    target_type = get_target_type(round_.target_type)
    if target_type is None:
        return
    max_score = max_score_for_ring_count(target_type.ring_count)
    if score > max_score:
        raise HTTPException(
            status_code=422,
            detail=f"score must be at most {max_score} on a {round_.target_type} target",
        )


@router.get("/games", response_model=list[GameRead])
def list_games(
    skip: int = 0,
    limit: int = 100,
    user_id: int | None = None,
    db: Session = Depends(deps.get_session),
) -> list[GameRead]:
    return game_crud.list_games(db, skip=skip, limit=limit, user_id=user_id)


@router.post("/games", response_model=GameRead, status_code=201)
def create_game(game_in: GameCreate, db: Session = Depends(deps.get_session)) -> GameRead:
    return game_crud.create_game(db, game_in)


@router.get("/games/{game_id}", response_model=GameRead)
def get_game(game_id: int, db: Session = Depends(deps.get_session)) -> GameRead:
    return deps.get_or_404(game_crud.get_game, db, game_id, detail="Game not found")


@router.patch("/games/{game_id}", response_model=GameRead)
def update_game(
    game_id: int, game_in: GameUpdate, db: Session = Depends(deps.get_session)
) -> GameRead:
    game = deps.get_or_404(game_crud.get_game, db, game_id, detail="Game not found")
    return game_crud.update_game(db, game, game_in)


@router.delete("/games/{game_id}", status_code=204)
def delete_game(game_id: int, db: Session = Depends(deps.get_session)) -> None:
    game = deps.get_or_404(game_crud.get_game, db, game_id, detail="Game not found")
    game_crud.delete_game(db, game)


@router.get("/trash/games", response_model=list[GameRead])
def list_deleted_games(
    skip: int = 0,
    limit: int = 100,
    user_id: int | None = None,
    db: Session = Depends(deps.get_session),
) -> list[GameRead]:
    return game_crud.list_deleted_games(db, skip=skip, limit=limit, user_id=user_id)


@router.post("/games/{game_id}/restore", response_model=GameRead)
def restore_game(game_id: int, db: Session = Depends(deps.get_session)) -> GameRead:
    game = deps.get_or_404(game_crud.get_game_any, db, game_id, detail="Game not found")
    if game.deleted_at is None:
        raise HTTPException(status_code=400, detail="Game is not deleted")
    return game_crud.restore_game(db, game)


@router.get("/matches", response_model=list[MatchSummary])
def list_matches(
    skip: int = 0,
    limit: int = 100,
    user_id: int | None = None,
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(deps.get_session),
) -> list[MatchSummary]:
    """Matches joined with their game's date, optionally filtered to a period and/or a user."""
    return game_crud.list_matches(
        db, user_id=user_id, start=start, end=end, skip=skip, limit=limit
    )


@router.get("/games/{game_id}/match", response_model=MatchRead)
def get_match_for_game(game_id: int, db: Session = Depends(deps.get_session)) -> MatchRead:
    deps.get_or_404(game_crud.get_game, db, game_id, detail="Game not found")
    return deps.get_or_404(game_crud.get_match_by_game, db, game_id, detail="Match not found")


@router.post("/games/{game_id}/match", response_model=MatchRead, status_code=201)
def create_match_for_game(
    game_id: int, match_in: MatchCreate, db: Session = Depends(deps.get_session)
) -> MatchRead:
    game = deps.get_or_404(game_crud.get_game, db, game_id, detail="Game not found")
    if game_crud.get_match_by_game(db, game_id) is not None:
        raise HTTPException(status_code=409, detail="Game already has a match")
    return game_crud.create_match(db, game, match_in)


@router.get("/matches/{match_id}", response_model=MatchRead)
def get_match(match_id: int, db: Session = Depends(deps.get_session)) -> MatchRead:
    return deps.get_or_404(game_crud.get_match, db, match_id, detail="Match not found")


@router.patch("/matches/{match_id}", response_model=MatchRead)
def update_match(
    match_id: int, match_in: MatchUpdate, db: Session = Depends(deps.get_session)
) -> MatchRead:
    match = deps.get_or_404(game_crud.get_match, db, match_id, detail="Match not found")
    return game_crud.update_match(db, match, match_in)


@router.delete("/matches/{match_id}", status_code=204)
def delete_match(match_id: int, db: Session = Depends(deps.get_session)) -> None:
    match = deps.get_or_404(game_crud.get_match, db, match_id, detail="Match not found")
    game_crud.delete_match(db, match)


@router.get("/games/{game_id}/rounds", response_model=list[RoundRead])
def list_rounds(
    game_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(deps.get_session)
) -> list[RoundRead]:
    deps.get_or_404(game_crud.get_game, db, game_id, detail="Game not found")
    return game_crud.list_rounds_for_game(db, game_id, skip=skip, limit=limit)


@router.post("/games/{game_id}/rounds", response_model=RoundRead, status_code=201)
def create_round(
    game_id: int, round_in: RoundCreate, db: Session = Depends(deps.get_session)
) -> RoundRead:
    game = deps.get_or_404(game_crud.get_game, db, game_id, detail="Game not found")
    return game_crud.create_round(db, game, round_in)


@router.get("/rounds/{round_id}", response_model=RoundRead)
def get_round(round_id: int, db: Session = Depends(deps.get_session)) -> RoundRead:
    return deps.get_or_404(game_crud.get_round, db, round_id, detail="Round not found")


@router.patch("/rounds/{round_id}", response_model=RoundRead)
def update_round(
    round_id: int, round_in: RoundUpdate, db: Session = Depends(deps.get_session)
) -> RoundRead:
    round_ = deps.get_or_404(game_crud.get_round, db, round_id, detail="Round not found")
    return game_crud.update_round(db, round_, round_in)


@router.delete("/rounds/{round_id}", status_code=204)
def delete_round(round_id: int, db: Session = Depends(deps.get_session)) -> None:
    round_ = deps.get_or_404(game_crud.get_round, db, round_id, detail="Round not found")
    game_crud.delete_round(db, round_)


@router.get("/trash/rounds", response_model=list[RoundRead])
def list_deleted_rounds(
    skip: int = 0,
    limit: int = 100,
    game_id: int | None = None,
    user_id: int | None = None,
    db: Session = Depends(deps.get_session),
) -> list[RoundRead]:
    return game_crud.list_deleted_rounds(
        db, skip=skip, limit=limit, game_id=game_id, user_id=user_id
    )


@router.post("/rounds/{round_id}/restore", response_model=RoundRead)
def restore_round(round_id: int, db: Session = Depends(deps.get_session)) -> RoundRead:
    round_ = deps.get_or_404(game_crud.get_round_any, db, round_id, detail="Round not found")
    if round_.deleted_at is None:
        raise HTTPException(status_code=400, detail="Round is not deleted")
    return game_crud.restore_round(db, round_)


@router.get("/rounds/{round_id}/ends", response_model=list[EndRead])
def list_ends(
    round_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(deps.get_session)
) -> list[EndRead]:
    deps.get_or_404(game_crud.get_round, db, round_id, detail="Round not found")
    return game_crud.list_ends_for_round(db, round_id, skip=skip, limit=limit)


@router.post("/rounds/{round_id}/ends", response_model=EndRead, status_code=201)
def create_end(
    round_id: int, end_in: EndCreate, db: Session = Depends(deps.get_session)
) -> EndRead:
    round_ = deps.get_or_404(game_crud.get_round, db, round_id, detail="Round not found")
    return game_crud.create_end(db, round_, end_in)


@router.get("/ends/{end_id}", response_model=EndRead)
def get_end(end_id: int, db: Session = Depends(deps.get_session)) -> EndRead:
    return deps.get_or_404(game_crud.get_end, db, end_id, detail="End not found")


@router.patch("/ends/{end_id}", response_model=EndRead)
def update_end(
    end_id: int, end_in: EndUpdate, db: Session = Depends(deps.get_session)
) -> EndRead:
    end = deps.get_or_404(game_crud.get_end, db, end_id, detail="End not found")
    return game_crud.update_end(db, end, end_in)


@router.delete("/ends/{end_id}", status_code=204)
def delete_end(end_id: int, db: Session = Depends(deps.get_session)) -> None:
    end = deps.get_or_404(game_crud.get_end, db, end_id, detail="End not found")
    game_crud.delete_end(db, end)


@router.get("/ends/{end_id}/points", response_model=list[PointRead])
def list_points(
    end_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(deps.get_session)
) -> list[PointRead]:
    deps.get_or_404(game_crud.get_end, db, end_id, detail="End not found")
    return game_crud.list_points_for_end(db, end_id, skip=skip, limit=limit)


@router.post("/ends/{end_id}/points", response_model=PointRead, status_code=201)
def create_point(
    end_id: int, point_in: PointCreate, db: Session = Depends(deps.get_session)
) -> PointRead:
    end = deps.get_or_404(game_crud.get_end, db, end_id, detail="End not found")
    _check_score_fits_target(db, end, point_in.score)
    return game_crud.create_point(db, end, point_in)


@router.get("/points/{point_id}", response_model=PointRead)
def get_point(point_id: int, db: Session = Depends(deps.get_session)) -> PointRead:
    return deps.get_or_404(game_crud.get_point, db, point_id, detail="Point not found")


@router.patch("/points/{point_id}", response_model=PointRead)
def update_point(
    point_id: int, point_in: PointUpdate, db: Session = Depends(deps.get_session)
) -> PointRead:
    point = deps.get_or_404(game_crud.get_point, db, point_id, detail="Point not found")
    if point_in.score is not None:
        end = deps.get_or_404(game_crud.get_end, db, point.end_id, detail="End not found")
        _check_score_fits_target(db, end, point_in.score)
    return game_crud.update_point(db, point, point_in)


@router.delete("/points/{point_id}", status_code=204)
def delete_point(point_id: int, db: Session = Depends(deps.get_session)) -> None:
    point = deps.get_or_404(game_crud.get_point, db, point_id, detail="Point not found")
    game_crud.delete_point(db, point)
