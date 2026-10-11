"""意見箱・お知らせ・エラーの集積の決まり。"""

from enum import StrEnum

MAX_FEEDBACK_LENGTH = 2000
MAX_EMAIL_LENGTH = 254
MAX_ANNOUNCEMENT_LENGTH = 2000
# お知らせは直近のこの件数だけを返す
ANNOUNCEMENT_LIMIT = 10


class ErrorReportKind(StrEnum):
    """フロントが送るエラーの種類。"""

    # 無いページを開いた
    PAGE = "page"
    # API がエラーを返した
    API = "api"


MAX_ERROR_KIND_LENGTH = 10
MAX_ERROR_PATH_LENGTH = 500
MAX_ERROR_METHOD_LENGTH = 10
MAX_ERROR_MESSAGE_LENGTH = 1000
