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


# 本人の行がまだ無い(登録の前)ときの 404 の detail。他人の行が無いときの "User not found" と
# 分け、フロントがこれを見て登録の画面へ送る(src/lib/api/client.ts)
CURRENT_USER_NOT_REGISTERED = "Current user not registered"


class ForbiddenError(PermissionError):
    """認証は通っているが、他人の行を読み書きしようとした。"""


class UnprocessableError(ValueError):
    """要求の形は合っているが、値がドメインの決まりに合わない(的が出せない点数など)。

    ValueError の子なので、pydantic の validator の中で投げれば要求の形の検証(422)として扱われる。
    """


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
    # ValueError の子なので、下の 400 より先にこちらが当たる
    app.add_exception_handler(UnprocessableError, _detail(422))
    # ドメインの検証(LegacyImportError など)は ValueError を投げる
    app.add_exception_handler(ValueError, _detail(400))
    app.add_exception_handler(ValidationError, _internal_error)
