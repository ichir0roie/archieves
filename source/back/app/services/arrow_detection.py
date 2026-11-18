"""写真の中の矢を見つけ、刺さった点を推測する。

矢は、色の目立つノックから軸(暗い直線)をたどって見つける。
1. ノックの色の小さな塊を取る。色はゲームのノックの色。決めていなければ、よくある蛍光の
   緑・オレンジ・ピンク
2. 塊ごとに、ノックの延長線上に乗った線分(LSD)を集めて軸の向きを決め、途切れるまでたどった先を
   刺さった点とする
3. 軸はどれも的面にほぼ垂直で平行なので、写真の上では一つの消失点へ向かう。
   確かな軸から消失点を求め、ほかの軸はその向きの近くに絞ってたどり直す
   (矢の傾きのぶん、幅を持たせる)
4. 羽根の色が決まっていれば、ノックの近くに羽根の色があるものを確からしくする

刺さった点は的に対する割合(target_detection.py)に直して返す。人が直す下書きなので、
見つけたものを確からしい順に並べて返し、本数で切るのは呼ぶ側(画面)に任せる。
"""

import math
from dataclasses import dataclass

import cv2
import numpy as np

from app.core.arrow_colors import ArrowColor
from app.services.target_detection import TargetFit

# 色の範囲(HSV。OpenCV の色相は 0〜180)。ノックは蛍光色が多いので、彩度・明度を高く取る
COLOR_RANGES: dict[ArrowColor, list[tuple[tuple[int, int, int], tuple[int, int, int]]]] = {
    ArrowColor.WHITE: [((0, 0, 190), (180, 45, 255))],
    ArrowColor.BLACK: [((0, 0, 0), (180, 255, 55))],
    ArrowColor.RED: [((0, 170, 120), (4, 255, 255)), ((170, 170, 120), (180, 255, 255))],
    ArrowColor.ORANGE: [((0, 190, 150), (16, 255, 255))],
    ArrowColor.YELLOW: [((22, 170, 190), (36, 255, 255))],
    ArrowColor.GREEN: [((45, 170, 120), (85, 255, 255))],
    ArrowColor.BLUE: [((100, 120, 60), (128, 255, 255))],
    ArrowColor.PURPLE: [((128, 80, 60), (150, 255, 255))],
    ArrowColor.PINK: [((145, 150, 170), (172, 255, 255))],
}
# ノックの色を決めていないときに探す色
DEFAULT_NOCK_COLORS = (ArrowColor.GREEN, ArrowColor.ORANGE, ArrowColor.PINK)


@dataclass(frozen=True)
class DetectedArrow:
    # 刺さった点(的に対する割合)
    x: float
    y: float
    confidence: float


def color_mask(hsv: np.ndarray, colors) -> np.ndarray:
    mask = np.zeros(hsv.shape[:2], np.uint8)
    for color in colors:
        for low, high in COLOR_RANGES[color]:
            mask = cv2.bitwise_or(mask, cv2.inRange(hsv, np.array(low), np.array(high)))
    return mask


def _nocks(hsv: np.ndarray, fit: TargetFit, colors) -> list[tuple[float, float]]:
    """ノックらしい塊の中心。大きさは的の大きさとの比で絞り、光で割れた一つのノックはまとめる"""
    mask = cv2.morphologyEx(color_mask(hsv, colors), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    count, _, stats, centroids = cv2.connectedComponentsWithStats(mask)
    low, high = (fit.radius_px * 0.012) ** 2, (fit.radius_px * 0.12) ** 2
    blobs = sorted(
        (
            (float(centroids[i][0]), float(centroids[i][1]), float(stats[i, cv2.CC_STAT_AREA]))
            for i in range(1, count)
            if low <= stats[i, cv2.CC_STAT_AREA] <= high
        ),
        key=lambda blob: -blob[2],
    )
    merged: list[list[float]] = []
    for x, y, area in blobs:
        # 的から遠すぎる塊(隣の的の矢・背景)は使わない
        if math.dist((x, y), fit.center_px) > fit.radius_px * 2:
            continue
        near = next(
            (m for m in merged if math.dist((m[0], m[1]), (x, y)) < fit.radius_px * 0.04), None
        )
        if near is None:
            merged.append([x, y, area])
        else:
            total = near[2] + area
            near[0], near[1], near[2] = (
                (near[0] * near[2] + x * area) / total,
                (near[1] * near[2] + y * area) / total,
                total,
            )
    return [(m[0], m[1]) for m in merged]


def _segments(gray: np.ndarray) -> np.ndarray:
    lines = cv2.createLineSegmentDetector().detect(gray)[0]
    # 線分が無いと、OpenCV のバージョンによって None か空の配列が返る
    lines = np.zeros((0, 4)) if lines is None else lines.reshape(-1, 4)
    lengths = np.hypot(lines[:, 2] - lines[:, 0], lines[:, 3] - lines[:, 1])
    return lines[lengths >= 12]


def _angle_gap(a: float, b: float) -> float:
    return abs((math.degrees(a - b) + 180) % 360 - 180)


def _trace(nock, segments: np.ndarray, max_length: float, tolerance: float, toward=None):
    """ノックから伸びる軸をたどる。(刺さった点, 長さ, 線分で埋まっている割合)。

    たどれなければ None
    """
    nx, ny = nock
    candidates = []
    for x1, y1, x2, y2 in segments:
        d1, d2 = math.hypot(x1 - nx, y1 - ny), math.hypot(x2 - nx, y2 - ny)
        near, far = ((x1, y1), (x2, y2)) if d1 < d2 else ((x2, y2), (x1, y1))
        if min(d1, d2) > max_length * 0.5 or max(d1, d2) > max_length:
            continue
        angle = math.atan2(far[1] - ny, far[0] - nx)
        # 線分の近い端が、ノックから遠い端へ向かう直線の近くにある(ノックの延長線上の線分)
        offset = abs((near[0] - nx) * math.sin(angle) - (near[1] - ny) * math.cos(angle))
        if offset > tolerance or (toward is not None and _angle_gap(angle, toward) > 20):
            continue
        candidates.append((angle, max(d1, d2) - min(d1, d2)))
    if not candidates:
        return None
    # 5 度刻みの向きごとに線分の長さを足し、いちばん重い向きを軸の向きとする
    weights: dict[int, float] = {}
    for angle, length in candidates:
        key = round(math.degrees(angle) / 5)
        weights[key] = weights.get(key, 0.0) + length
    best = max(
        weights, key=lambda k: weights[k] + (weights.get(k - 1, 0) + weights.get(k + 1, 0)) / 2
    )
    chosen = [a for a, _ in candidates if abs(round(math.degrees(a) / 5) - best) <= 1]
    angle = math.atan2(
        sum(math.sin(a) for a in chosen) / len(chosen),
        sum(math.cos(a) for a in chosen) / len(chosen),
    )
    ux, uy = math.cos(angle), math.sin(angle)
    # その向きの直線に乗った線分を、ノックから近い順につなぎ、途切れる所までを軸とする
    pieces = []
    for x1, y1, x2, y2 in segments:
        t1, t2 = (x1 - nx) * ux + (y1 - ny) * uy, (x2 - nx) * ux + (y2 - ny) * uy
        o1, o2 = abs((x1 - nx) * uy - (y1 - ny) * ux), abs((x2 - nx) * uy - (y2 - ny) * ux)
        if max(o1, o2) <= tolerance and min(t1, t2) >= 0 and max(t1, t2) <= max_length:
            pieces.append((min(t1, t2), max(t1, t2)))
    reach, covered = 0.0, 0.0
    for start, end in sorted(pieces):
        # ノックの直後は羽根で軸が隠れるので、最初の線分までは長めに空いてよい
        if start > reach + max_length * (0.12 if reach else 0.3):
            break
        covered += max(0.0, end - max(start, reach))
        reach = max(reach, end)
    if reach < max_length * 0.1:
        return None
    return (nx + ux * reach, ny + uy * reach), reach, covered / reach


def _vanishing(lines):
    """確かな軸(ノック → 刺さった点)がそろって向かう向きを、点ごとに返す関数。

    軸が二本に満たなければ None。
    消失点を最小二乗で求め、平行に近い(消失点が遠い)ときは向きの平均にする"""
    if len(lines) < 2:
        return None
    rows, values, directions = [], [], []
    for (nx, ny), (ex, ey) in lines:
        length = math.hypot(ex - nx, ey - ny)
        dx, dy = (ex - nx) / length, (ey - ny) / length
        directions.append((dx, dy))
        rows.append((-dy, dx))
        values.append(-dy * nx + dx * ny)
    mean = math.atan2(sum(d[1] for d in directions), sum(d[0] for d in directions))
    a = np.array(rows)
    if np.linalg.cond(a.T @ a) > 1e6:
        return lambda x, y: mean
    vx, vy = np.linalg.lstsq(a, np.array(values), rcond=None)[0]

    def toward(x: float, y: float) -> float:
        angle = math.atan2(vy - y, vx - x)
        # 消失点がノックの後ろ側にあたる(平均と大きく違う)ときは、平均の向きを使う
        return mean if _angle_gap(angle, mean) > 60 else angle

    return toward


def _fletch_bonus(hsv: np.ndarray, nock, end, color: ArrowColor | None, radius: float) -> float:
    """ノックの近く(軸の手前側)に羽根の色があれば、確からしさに足す"""
    if color is None:
        return 0.0
    nx, ny = nock
    ex, ey = end
    # 羽根はノックから軸に沿って少し先にある
    cx, cy = nx + (ex - nx) * 0.15, ny + (ey - ny) * 0.15
    half = max(4, round(radius * 0.06))
    x0, y0 = max(0, round(cx) - half), max(0, round(cy) - half)
    window = hsv[y0 : round(cy) + half, x0 : round(cx) + half]
    if window.size == 0:
        return 0.0
    ratio = float((color_mask(window, [color]) > 0).mean())
    return 0.3 if ratio >= 0.12 else -0.2


def detect_arrows(
    image_bgr: np.ndarray,
    fit: TargetFit,
    nock_color: ArrowColor | None = None,
    fletch_color: ArrowColor | None = None,
) -> list[DetectedArrow]:
    """見つけた矢を、確からしい順に"""
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    segments = _segments(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY))
    nocks = _nocks(hsv, fit, [nock_color] if nock_color else DEFAULT_NOCK_COLORS)
    max_length = fit.radius_px * 1.3
    tolerance = max(3.0, fit.radius_px * 0.012)
    first = [(nock, _trace(nock, segments, max_length, tolerance)) for nock in nocks]
    toward = _vanishing([(nock, t[0]) for nock, t in first if t is not None and t[2] > 0.6])
    arrows = []
    for nock in nocks:
        traced = _trace(
            nock,
            segments,
            max_length,
            tolerance,
            toward=None if toward is None else toward(*nock),
        )
        if traced is None:
            continue
        end, length, covered = traced
        mapped = fit.homography @ np.array([end[0], end[1], 1.0])
        confidence = covered * min(1.0, length / (fit.radius_px * 0.3))
        confidence += _fletch_bonus(hsv, nock, end, fletch_color, fit.radius_px)
        arrows.append(
            DetectedArrow(
                x=float(mapped[0] / mapped[2]),
                y=float(mapped[1] / mapped[2]),
                confidence=round(float(min(1.0, max(0.0, confidence))), 3),
            )
        )
    return sorted(arrows, key=lambda arrow: -arrow.confidence)
