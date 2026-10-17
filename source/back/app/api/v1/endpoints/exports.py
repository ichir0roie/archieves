from datetime import datetime

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api import deps
from app.core.timezone import JST
from app.db import User
from app.services import archieves_export

router = APIRouter()


@router.get(
    "/export/records.db",
    response_class=Response,
    responses={
        200: {
            "content": {
                "application/vnd.sqlite3": {
                    "schema": {
                        "type": "string",
                        "format": "binary",
                    },
                },
            },
        },
    },
)
def export_records(
    me: User = Depends(deps.get_reader),
    s: Session = Depends(deps.get_session),
) -> Response:
    """本人の記録を SQLite のファイルで返す。

    表と列の説明はファイルの中の `_about`・`_columns` にある。
    """
    filename = archieves_export.export_filename(datetime.now(JST).date())
    return Response(
        content=archieves_export.export_sqlite(s, me.id),
        media_type="application/vnd.sqlite3",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
