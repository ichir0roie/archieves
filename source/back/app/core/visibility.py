from enum import StrEnum
from typing import Protocol


class Visibility(StrEnum):
    """プロフィール・ランキングを、本人のほかにだれへ見せるか。既定は private。"""

    PRIVATE = "private"
    # 同じ組織(users.organization_id)の利用者だけ
    ORGANIZATION = "organization"
    PUBLIC = "public"


# users.*_visibility の列の長さ
VISIBILITY_MAX_LENGTH = 20


class _Member(Protocol):
    id: int
    organization_id: int | None


def is_visible(viewer: _Member, owner: _Member, visibility: str) -> bool:
    """owner が visibility で公開しているものが、viewer に見えるか。

    本人も他人と同じに扱う(非公開のランキングには本人も載らない)。本人のプロフィールのように
    本人にはいつも見せるものは、呼ぶ側で本人を先に通す。
    組織に入っていない利用者どうしは「同じ組織」とみなさない(組織公開でも見えない)。
    crud/user.py の visible_condition() が同じ決まりの SQL 版。
    """
    if visibility == Visibility.PUBLIC:
        return True
    return (
        visibility == Visibility.ORGANIZATION
        and owner.organization_id is not None
        and owner.organization_id == viewer.organization_id
    )
