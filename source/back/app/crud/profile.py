from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.crud import game as game_crud
from app.crud import statistics as statistics_crud
from app.crud import user as user_crud
from app.schemas.profile import UserProfile
from app.schemas.user import UserRead

# How far back the public profile's "recent activity" window reaches.
RECENT_PERIOD_DAYS = 365


def get_user_profile(
    db: Session, user_id: int, *, now: date | None = None
) -> UserProfile | None:
    user = user_crud.get_user(db, user_id)
    if user is None:
        return None

    period_end = now if now is not None else date.today()
    period_start = period_end - timedelta(days=RECENT_PERIOD_DAYS)

    return UserProfile(
        user=UserRead.model_validate(user),
        period_start=period_start,
        period_end=period_end,
        rounds=statistics_crud.round_score_statistics(
            db, start=period_start, end=period_end, user_id=user_id
        ),
        ends=statistics_crud.end_score_statistics(
            db, start=period_start, end=period_end, user_id=user_id
        ),
        points=statistics_crud.point_score_statistics(
            db, start=period_start, end=period_end, user_id=user_id
        ),
        matches=game_crud.list_matches(
            db, user_id=user_id, start=period_start, end=period_end, limit=100
        ),
    )
