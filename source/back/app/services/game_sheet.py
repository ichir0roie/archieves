"""ゲームの記録(ゲーム・ラウンド・エンド・矢・コメント)を丸ごと一度に読み書きする。

入力の画面は記録を手元に溜め、保存・終了のときに丸ごと送る(schemas/game_sheet.py)。
書くときは、送られたものを正とする:
- id の無いラウンド・エンド・矢は作り、id のあるものはその行を上書きする
- 今あるのに送られてこなかったものは消す(ラウンドはゴミ箱へ、エンド・矢は消す。どちらも
  一つずつ消すエンドポイントと同じ扱い)
- コメントは中身があれば書き、null か空白だけなら消す
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, NotFoundError
from app.core.scoring import max_score_for_ring_count
from app.core.target_types import TARGET_TYPE_IDS, get_target_type
from app.crud import comment as comment_crud
from app.crud import game as game_crud
from app.db import End, Game, Point, Round, User
from app.schemas.game import PointRead
from app.schemas.game_sheet import (
    EndSheetRead,
    EndSheetWrite,
    GameSheetRead,
    GameSheetWrite,
    PointSheetWrite,
    RoundSheetRead,
    RoundSheetWrite,
)


def _check_target_type(target_type: str) -> None:
    if target_type not in TARGET_TYPE_IDS:
        raise HTTPException(
            status_code=422, detail=f"target_type must be one of {TARGET_TYPE_IDS}"
        )


def _check_score_fits_target(round_: Round, score: int) -> None:
    """的が出せない点数を弾く(10 点までの的に X など)。決まった的でない古いラウンドは確かめない。"""
    target_type = get_target_type(round_.target_type)
    if target_type is None:
        return
    max_score = max_score_for_ring_count(target_type.ring_count)
    if score > max_score:
        raise HTTPException(
            status_code=422,
            detail=f"score must be at most {max_score} on a {round_.target_type} target",
        )


def _comment_body(comment: str | None) -> str | None:
    if comment is None:
        return None
    body = comment.strip()
    return body or None


def _resolve_game(s: Session, me: User, sheet_in: GameSheetWrite) -> Game:
    if sheet_in.id is not None:
        game = game_crud.get_game(s, sheet_in.id)
        if game is None:
            raise NotFoundError("Game not found")
        if game.user_id != me.id:
            raise ForbiddenError("Not allowed to access another user's data")
        return game
    if sheet_in.client_key is not None:
        game = game_crud.get_game_by_client_key(s, me.id, sheet_in.client_key)
        if game is not None:
            if game.deleted_at is not None:
                raise NotFoundError("Game not found")
            return game
    game = Game(user_id=me.id, recorded_at=sheet_in.recorded_at, client_key=sheet_in.client_key)
    s.add(game)
    s.flush()
    return game


def _save_game_comment(s: Session, game: Game, comment: str | None) -> None:
    body = _comment_body(comment)
    current = comment_crud.get_game_comment(s, game.id)
    if body is not None:
        comment_crud.upsert_game_comment(s, game, body)
    elif current is not None:
        comment_crud.delete_comment(s, current)


def _save_round_comment(s: Session, round_: Round, comment: str | None) -> None:
    body = _comment_body(comment)
    current = comment_crud.get_round_comment(s, round_.id)
    if body is not None:
        comment_crud.upsert_round_comment(s, round_, body)
    elif current is not None:
        comment_crud.delete_comment(s, current)


def _save_end_comment(s: Session, end: End, comment: str | None) -> None:
    body = _comment_body(comment)
    current = comment_crud.get_end_comment(s, end.id)
    if body is not None:
        comment_crud.upsert_end_comment(s, end, body)
    elif current is not None:
        comment_crud.delete_comment(s, current)


def _save_points(s: Session, round_: Round, end: End, points_in: list[PointSheetWrite]) -> None:
    existing = {point.id: point for point in game_crud.list_all_points_for_end(s, end.id)}
    kept: set[int] = set()
    for point_in in points_in:
        _check_score_fits_target(round_, point_in.score)
        if point_in.id is None:
            point = Point(end_id=end.id, user_id=end.user_id)
            s.add(point)
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
    s.flush()


def _save_ends(s: Session, round_: Round, ends_in: list[EndSheetWrite]) -> None:
    existing = {end.id: end for end in game_crud.list_all_ends_for_round(s, round_.id)}
    kept: set[int] = set()
    for end_in in ends_in:
        if end_in.id is None:
            end = End(round_id=round_.id, user_id=round_.user_id)
            s.add(end)
        else:
            found = existing.get(end_in.id)
            if found is None:
                raise NotFoundError("End not found")
            end = found
            kept.add(end.id)
        end.number = end_in.number
        end.recorded_at = end_in.recorded_at
        s.flush()
        _save_end_comment(s, end, end_in.comment)
        _save_points(s, round_, end, end_in.points)
    for end_id, end in existing.items():
        if end_id not in kept:
            game_crud.delete_end(s, end)


def _save_rounds(s: Session, game: Game, rounds_in: list[RoundSheetWrite]) -> None:
    existing = {round_.id: round_ for round_ in game_crud.list_all_rounds_for_game(s, game.id)}
    kept: set[int] = set()
    for round_in in rounds_in:
        if round_in.id is None:
            _check_target_type(round_in.target_type)
            round_ = Round(game_id=game.id, user_id=game.user_id)
            s.add(round_)
        else:
            found = existing.get(round_in.id)
            if found is None:
                raise NotFoundError("Round not found")
            round_ = found
            if round_in.target_type != round_.target_type:
                _check_target_type(round_in.target_type)
            kept.add(round_.id)
        round_.number = round_in.number
        round_.recorded_at = round_in.recorded_at
        round_.end_size = round_in.end_size
        round_.round_size = round_in.round_size
        round_.distance_m = round_in.distance_m
        round_.target_type = round_in.target_type
        s.flush()
        _save_round_comment(s, round_, round_in.comment)
        _save_ends(s, round_, round_in.ends)
    for round_id, round_ in existing.items():
        if round_id not in kept:
            game_crud.delete_round(s, round_)


def save_game_sheet(s: Session, me: User, sheet_in: GameSheetWrite) -> Game:
    """送られた記録でゲームを作る・上書きする。コミットは呼ぶ側がする。"""
    game = _resolve_game(s, me, sheet_in)
    game.recorded_at = sheet_in.recorded_at
    game.game_size = sheet_in.game_size
    game.bow_type = sheet_in.bow_type
    s.flush()
    _save_game_comment(s, game, sheet_in.comment)
    _save_rounds(s, game, sheet_in.rounds)
    return game


def _by_number[T: Round | End | Point](rows: list[T]) -> list[T]:
    return sorted(rows, key=lambda row: (row.number, row.id))


def read_game_sheet(s: Session, game: Game) -> GameSheetRead:
    game_comment = comment_crud.get_game_comment(s, game.id)
    round_comments = {
        comment.round_id: comment.body
        for comment in comment_crud.list_round_comments_for_game(s, game.id)
    }
    end_comments = {
        comment.end_id: comment.body
        for comment in comment_crud.list_end_comments_for_game(s, game.id)
    }
    rounds: list[RoundSheetRead] = []
    for round_ in _by_number(game_crud.list_all_rounds_for_game(s, game.id)):
        ends: list[EndSheetRead] = []
        for end in _by_number(game_crud.list_all_ends_for_round(s, round_.id)):
            points = _by_number(game_crud.list_all_points_for_end(s, end.id))
            ends.append(
                EndSheetRead(
                    id=end.id,
                    number=end.number,
                    recorded_at=end.recorded_at,
                    comment=end_comments.get(end.id),
                    points=[PointRead.model_validate(point) for point in points],
                )
            )
        rounds.append(
            RoundSheetRead(
                id=round_.id,
                number=round_.number,
                recorded_at=round_.recorded_at,
                end_size=round_.end_size,
                round_size=round_.round_size,
                distance_m=round_.distance_m,
                target_type=round_.target_type,
                comment=round_comments.get(round_.id),
                ends=ends,
            )
        )
    return GameSheetRead(
        id=game.id,
        client_key=game.client_key,
        user_id=game.user_id,
        recorded_at=game.recorded_at,
        game_size=game.game_size,
        bow_type=game.bow_type,
        comment=game_comment.body if game_comment else None,
        rounds=rounds,
    )
