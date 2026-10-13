"""ゲームの記録(ゲーム・ラウンド・エンド・矢・コメント)を丸ごと一度に読み書きする。

入力の画面は記録を手元に溜め、保存・終了のときに丸ごと送る(schemas/game_sheet.py)。
書くときは、送られたものを正とする:
- id の無いラウンド・エンド・矢は作り、id のあるものはその行を上書きする
- 今あるのに送られてこなかったものは消す(ラウンドはゴミ箱へ、エンド・矢は消す。どちらも
  一つずつ消すエンドポイントと同じ扱い)
- コメントは中身があれば書き、null か空白だけなら消す

読むときも書くときも、ゲームの記録は crud/game.py の get_game_sheet などで一度に引いたもの
(game.rounds → round_.ends → end.points と各 comment)をたどり、ここでは SQL を出さない。
"""

from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.core.target_types import check_target_type
from app.crud import comment as comment_crud
from app.crud import game as game_crud
from app.db import End, Game, Point, Round, User
from app.schemas.game import GameFields, PointRead
from app.schemas.game_sheet import (
    EndSheetRead,
    EndSheetWrite,
    GameSheetRead,
    GameSheetWrite,
    PointSheetWrite,
    RoundSheetRead,
    RoundSheetWrite,
    SharedGameRead,
)


def _comment_body(comment: str | None) -> str | None:
    if comment is None:
        return None
    body = comment.strip()
    return body or None


_GAME_FIELDS = frozenset(GameFields.model_fields)


def _find_or_create_game(s: Session, me: User, sheet_in: GameSheetWrite) -> Game:
    """id の無い記録を書くゲーム。同じ client_key のゲームがあればそれ、無ければ作る。"""
    if sheet_in.client_key is None:
        return game_crud.create_sheet_game(s, me.id, sheet_in.recorded_at)
    game = game_crud.get_or_create_game_by_client_key(
        s,
        me.id,
        sheet_in.client_key,
        sheet_in.recorded_at,
    )
    if game.deleted_at is not None:
        raise NotFoundError("Game not found")
    return game


def _save_points(s: Session, round_: Round, end: End, points_in: list[PointSheetWrite]) -> None:
    existing = {point.id: point for point in end.points}
    kept: set[int] = set()
    for point_in in points_in:
        if point_in.id is None:
            point = Point(user_id=end.user_id)
            end.points.append(point)
        else:
            found = existing.get(point_in.id)
            if found is None:
                raise NotFoundError("Point not found")
            point = found
            kept.add(point.id)
        point.number = point_in.number
        point.score = point_in.score
        point.x = point_in.x
        point.y = point_in.y
        point.recorded_at = point_in.recorded_at
        point.shot_at = point_in.shot_at
        point.x_cm, point.y_cm = game_crud.point_cm(round_, point_in.x, point_in.y)
    for point_id, point in existing.items():
        if point_id not in kept:
            game_crud.delete_point(s, point)


def _save_ends(s: Session, round_: Round, ends_in: list[EndSheetWrite]) -> None:
    existing = {end.id: end for end in round_.ends}
    kept: set[int] = set()
    for end_in in ends_in:
        if end_in.id is None:
            end = End(user_id=round_.user_id)
            round_.ends.append(end)
        else:
            found = existing.get(end_in.id)
            if found is None:
                raise NotFoundError("End not found")
            end = found
            kept.add(end.id)
        end.number = end_in.number
        end.recorded_at = end_in.recorded_at
        comment_crud.save_comment(s, end, end.comment, _comment_body(end_in.comment))
        _save_points(s, round_, end, end_in.points)
    for end_id, end in existing.items():
        if end_id not in kept:
            game_crud.delete_end(s, end)


def _save_rounds(s: Session, game: Game, rounds_in: list[RoundSheetWrite]) -> None:
    existing = {round_.id: round_ for round_ in game.rounds}
    kept: set[int] = set()
    for round_in in rounds_in:
        if round_in.id is None:
            check_target_type(round_in.target_type)
            round_ = Round(user_id=game.user_id)
            game.rounds.append(round_)
        else:
            found = existing.get(round_in.id)
            if found is None:
                raise NotFoundError("Round not found")
            round_ = found
            if round_in.target_type != round_.target_type:
                check_target_type(round_in.target_type)
            kept.add(round_.id)
        round_.number = round_in.number
        round_.recorded_at = round_in.recorded_at
        round_.end_size = round_in.end_size
        round_.round_size = round_in.round_size
        round_.distance_m = round_in.distance_m
        round_.target_type = round_in.target_type
        comment_crud.save_comment(s, round_, round_.comment, _comment_body(round_in.comment))
        _save_ends(s, round_, round_in.ends)
    for round_id, round_ in existing.items():
        if round_id not in kept:
            game_crud.delete_round(s, round_)


def save_game_sheet(
    s: Session,
    me: User,
    game: Game | None,
    sheet_in: GameSheetWrite,
) -> Game:
    """送られた記録でゲームを作る・上書きする。コミットは呼ぶ側がする。

    game は sheet_in.id のゲームを、持ち主を確かめて get_game_sheet で引いたもの
    (id が無ければ None)。
    返すゲームは、書いたあとの記録を読み直したもの。
    """
    if game is None:
        game = _find_or_create_game(s, me, sheet_in)
    # 送られた欄だけを書く。欄を足す前のフロント(入力の途中のキャッシュ)が送らない欄を、既定値で
    # 上書きしないため。新しいゲームの列の既定値は、スキーマの既定値と同じ
    for field in _GAME_FIELDS & sheet_in.model_fields_set:
        setattr(game, field, getattr(sheet_in, field))
    comment_crud.save_comment(s, game, game.comment, _comment_body(sheet_in.comment))
    _save_rounds(s, game, sheet_in.rounds)
    s.flush()
    return game_crud.refresh_game_sheet(s, game)


def read_game_sheet(game: Game) -> GameSheetRead:
    """get_game_sheet などで記録を読み込んだゲームを、応答の形にする。"""
    return GameSheetRead(
        id=game.id,
        client_key=game.client_key,
        user_id=game.user_id,
        recorded_at=game.recorded_at,
        game_size=game.game_size,
        bow_type=game.bow_type,
        arrow_diameter_mm=game.arrow_diameter_mm,
        all_in=game.all_in,
        backfilled=game.backfilled,
        comment=game.comment.body if game.comment else None,
        rounds=[
            RoundSheetRead(
                id=round_.id,
                number=round_.number,
                recorded_at=round_.recorded_at,
                end_size=round_.end_size,
                round_size=round_.round_size,
                distance_m=round_.distance_m,
                target_type=round_.target_type,
                comment=round_.comment.body if round_.comment else None,
                ends=[
                    EndSheetRead(
                        id=end.id,
                        number=end.number,
                        recorded_at=end.recorded_at,
                        comment=end.comment.body if end.comment else None,
                        points=[PointRead.model_validate(point) for point in end.points],
                    )
                    for end in round_.ends
                ],
            )
            for round_ in game.rounds
        ],
    )


def read_shared_game(game: Game) -> SharedGameRead:
    """list_shared_game_sheets で持ち主ごと読み込んだゲームを、公開ページの応答の形にする。"""
    sheet = read_game_sheet(game)
    return SharedGameRead(
        id=sheet.id,
        owner_name=game.user.name,
        recorded_at=sheet.recorded_at,
        bow_type=sheet.bow_type,
        comment=sheet.comment,
        rounds=sheet.rounds,
    )
