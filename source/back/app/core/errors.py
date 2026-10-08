"""ドメインの例外と、それを HTTP の応答に変える例外ハンドラ。

エンドポイントは try/except で HTTPException に詰め替えず、ここの例外を投げたまま返す。
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

logger = logging.getLogger(__name__)


class NotFoundError(LookupError):
    """指した行が無い(消された行を含む)。"""


class ForbiddenError(PermissionError):
    """認証は通っているが、他人の行を読み書きしようとした。"""


def _detail(status_code: int):
    def handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=status_code, content={"detail": str(exc)})

    return handler


def _internal_error(request: Request, exc: Exception) -> JSONResponse:
    # pydantic の ValidationError は ValueError の子だが、
    # 要求の値ではなくコードの不具合なので 400 にしない
    logger.exception(f"{request.method} {request.url.path} で応答の組み立てに失敗した")
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


def install_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(NotFoundError, _detail(404))
    app.add_exception_handler(ForbiddenError, _detail(403))
    # ドメインの検証(LegacyImportError など)は ValueError を投げる
    app.add_exception_handler(ValueError, _detail(400))
    app.add_exception_handler(ValidationError, _internal_error)
