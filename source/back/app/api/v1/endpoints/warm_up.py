from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api import deps
from app.crud import warm_up as warm_up_crud

router = APIRouter()


@router.get(
    "/warm-up",
    status_code=204,
    dependencies=[Depends(deps.get_browser_claims)],
)
def warm_up(s: Session = Depends(deps.get_session)) -> None:
    """画面が開いている間、フロントが 1 分ごとに叩く(components/ApiWarmUp.tsx)。

    点数の入力は手元にだけ書くので、保存までの間 API が叩かれず、Lambda の実行環境が落ちる(5 分ほど
    空くと冷える)。冷えた所への保存は、起動と db への初めての接続(IAM 認証)で数秒かかる。
    実行環境と db の接続を残しておくため、db まで一往復する。/health は db に触らないので
    代わりにならない。
    """
    warm_up_crud.ping(s)
