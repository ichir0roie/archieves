"""写真の中の矢を見つけ、刺さった点を推測する。

矢は、色の目立つノックから軸(暗い直線)をたどって見つける。
1. ノックの色の小さな塊を取る。色はゲームのノックの色(本人の矢の写真から測った色)の近く。
   決めていなければ(写真モードの前に始めた古いゲーム)、よくある蛍光の緑・オレンジ・ピンク
2. 塊ごとに、ノックの延長線上に乗った線分(LSD)を集めて軸の向きを決める。刺さった点はノックより
   的の側にあるので、ノックから的の中心への向きに近いものだけを見る
3. 軸の向きは、乗った線分に直線を当て直して決める(粗い向きのままだと、遠くの軸が幅から外れて
   途中で止まる)
4. 軸に沿って、軸と平行な線分で埋まった所を足し、空いた所を引いて、和がいちばん大きい所を
   刺さった点とする。羽根・印字・黒の帯の上で途切れて見える軸を越え、的の面に出たら止まる。
   軸と向きの違う短い線分(穴の縁)は数えないので、穴だらけの金・赤の帯で先まで行き過ぎない
5. 羽根の色が決まっていれば、ノックの近くに羽根の色があるものを確からしくする
6. 確からしい順に並べ、先に選んだものとほぼ同じ所の推測(同じ矢)を除く

刺さった点は的に対する割合(target_detection.py)に直して返す。人が直す下書きなので、
見つけたものを確からしい順に並べて返し、本数で切るのは呼ぶ側(画面)に任せる。

数字は tools/photo_eval.py(手で付けた正解との比べ)で決めた。変えたらそれで確かめる。
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
# 測ったノックの色からの幅(OpenCV の HSV)。色相は光で変わりにくいので狭く、彩度・明度は日なた・
# 日陰で大きく変わるので、測った値の割合を下限にする
NOCK_HUE_RANGE = 10
NOCK_MIN_SATURATION_RATIO = 0.5
NOCK_MIN_VALUE_RATIO = 0.45
# これより彩度の低い色(白・黒・灰)は色相が決まらないので、明るさで探す
ACHROMATIC_SATURATION = 60
# 刺さった点が的の中心からこれより遠い(的に対する割合)ものは、矢でない(台・背景の色の塊から
# たどった線)とみなす。的紙の外の畳に刺さった矢までは拾う
MAX_ENTRY_DISTANCE = 0.62
# 軸をたどるときの刻み(px)と、軸の見えない所 1 刻みの重み(見えている所は 1)
TRACE_STEP_PX = 2.0
SHAFT_GAP_COST = 0.4
# これより近い推測は同じ矢とみなす(的に対する割合)。80cm の的で 8mm、矢の太さほど
DUPLICATE_DISTANCE = 0.01
# たどる向きと、ノックから的の中心への向きの差の上限(度)
MAX_OUTWARD_ANGLE = 60
# 写真の上の軸の長さの上限と、線分を軸に乗っているとみなす幅(的の半径に対する割合)
MAX_SHAFT_LENGTH = 1.3
SHAFT_TOLERANCE = 0.012
# 線分を軸の縁とみなす、軸の向きとの角の上限(度)。3〜8 度で結果はほとんど変わらない
SHAFT_ALIGN_DEGREES = 5
# 軸の直線を当て直すときの、線分を拾う幅の倍率(広めから狭めへ)。広げすぎると、まとまって
# 刺さった隣の矢の軸まで拾い、そちらへ乗り換える
SHAFT_REFIT_WIDENING = (1.5, 1.0)


@dataclass(frozen=True)
class DetectedArrow:
    # 刺さった点(的に対する割合)
    x: float
    y: float
    confidence: float


HsvRange = tuple[tuple[int, int, int], tuple[int, int, int]]


def _range_mask(hsv: np.ndarray, ranges: list[HsvRange]) -> np.ndarray:
    mask = np.zeros(hsv.shape[:2], np.uint8)
    for low, high in ranges:
        mask = cv2.bitwise_or(mask, cv2.inRange(hsv, np.array(low), np.array(high)))
    return mask


def color_mask(hsv: np.ndarray, colors) -> np.ndarray:
    return _range_mask(hsv, [r for color in colors for r in COLOR_RANGES[color]])


def nock_ranges(hex_color: str) -> list[HsvRange]:
    """測ったノックの色(#rrggbb)の近くの、HSV の範囲"""
    rgb = [int(hex_color[i : i + 2], 16) for i in (1, 3, 5)]
    pixel = np.array([[rgb[::-1]]], dtype=np.uint8)
    h, s, v = (int(c) for c in cv2.cvtColor(pixel, cv2.COLOR_BGR2HSV)[0, 0])
    if s < ACHROMATIC_SATURATION:
        # 白は明るい所、黒は暗い所。間の灰は明るさの近くだけ
        low_v, high_v = max(0, v - 60), min(255, v + 60)
        return [((0, 0, low_v), (180, ACHROMATIC_SATURATION, high_v))]
    low_s = max(70, round(s * NOCK_MIN_SATURATION_RATIO))
    low_v = max(70, round(v * NOCK_MIN_VALUE_RATIO))
    low_h, high_h = h - NOCK_HUE_RANGE, h + NOCK_HUE_RANGE
    # 色相は 0 と 180 がつながっている(赤)
    if low_h < 0:
        return [
            ((0, low_s, low_v), (high_h, 255, 255)),
            ((180 + low_h, low_s, low_v), (180, 255, 255)),
        ]
    if high_h > 180:
        return [
            ((low_h, low_s, low_v), (180, 255, 255)),
            ((0, low_s, low_v), (high_h - 180, 255, 255)),
        ]
    return [((low_h, low_s, low_v), (high_h, 255, 255))]


def _nocks(hsv: np.ndarray, fit: TargetFit, ranges: list[HsvRange]) -> list[tuple[float, float]]:
    """ノックらしい塊の中心。大きさは的の大きさとの比で絞り、光で割れた一つのノックはまとめる"""
    mask = cv2.morphologyEx(_range_mask(hsv, ranges), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
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


def _trace(nock, segments: np.ndarray, max_length: float, tolerance: float, center):
    """ノックから伸びる軸をたどる。(刺さった点, 長さ, 線分で埋まっている割合)。

    たどれなければ None
    """
    nx, ny = nock
    # 刺さった点はノックより的の側にある。的から遠ざかる向き(畳の筋・台の縁)はたどらない
    inward = math.atan2(center[1] - ny, center[0] - nx)
    candidates = []
    for x1, y1, x2, y2 in segments:
        d1, d2 = math.hypot(x1 - nx, y1 - ny), math.hypot(x2 - nx, y2 - ny)
        near, far = ((x1, y1), (x2, y2)) if d1 < d2 else ((x2, y2), (x1, y1))
        if min(d1, d2) > max_length * 0.5 or max(d1, d2) > max_length:
            continue
        angle = math.atan2(far[1] - ny, far[0] - nx)
        # 線分の近い端が、ノックから遠い端へ向かう直線の近くにある(ノックの延長線上の線分)
        offset = abs((near[0] - nx) * math.sin(angle) - (near[1] - ny) * math.cos(angle))
        if offset > tolerance or _angle_gap(angle, inward) > MAX_OUTWARD_ANGLE:
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
    # 多数決の向きは 5 度刻みで粗く、遠くの軸が幅から外れて途中で止まる。直線に乗った線分の端へ
    # 直線を当て直す(広めの幅で拾ってから、狭めの幅で)
    ox, oy = nx, ny
    for widen in SHAFT_REFIT_WIDENING:
        on = _on_line(segments, (ox, oy), (ux, uy), tolerance * widen, max_length)
        if on.sum() < 2:
            break
        (ox, oy), (ux, uy) = _fit_line(segments[on], (ux, uy))
        # ノックを当て直した直線に落とした所を、たどる始まりにする
        t = (nx - ox) * ux + (ny - oy) * uy
        ox, oy = ox + ux * t, oy + uy * t
    # その直線に乗った線分で、ノックからの距離ごとに軸が見えている所を塗る
    bins = np.zeros(max(1, math.ceil(max_length / TRACE_STEP_PX)), bool)
    for x1, y1, x2, y2 in segments[_on_line(segments, (ox, oy), (ux, uy), tolerance, max_length)]:
        t1, t2 = (x1 - ox) * ux + (y1 - oy) * uy, (x2 - ox) * ux + (y2 - oy) * uy
        bins[int(min(t1, t2) / TRACE_STEP_PX) : math.ceil(max(t1, t2) / TRACE_STEP_PX)] = True
    # 軸は羽根・印字・黒の帯の上で途切れて見える。見えている所を +1、空いた所を -SHAFT_GAP_COST と
    # して足し、和がいちばん大きい所を軸の終わりとする。隙間の先にまた軸が続けば越え、
    # 刺さった点より先(的の面)は空きが続くので止まる
    gain = np.cumsum(np.where(bins, 1.0, -SHAFT_GAP_COST))
    last = int(gain.argmax())
    reach = (last + 1) * TRACE_STEP_PX
    if gain[last] <= 0 or reach < max_length * 0.1:
        return None
    covered = float(bins[: last + 1].sum()) * TRACE_STEP_PX
    return (ox + ux * reach, oy + uy * reach), reach, covered / reach


def _on_line(
    segments: np.ndarray, origin, direction, width: float, max_length: float
) -> np.ndarray:
    """origin から direction へ伸びる直線(長さ max_length、幅 width)に乗った線分。

    軸の縁は軸と平行に長く続く。向きの違う短い線分(穴の縁・破れた紙)は、幅の中にあっても数えない。
    数えると、穴だらけの金・赤の帯の上で、刺さった点を越えて先まで軸が続いて見える
    """
    ox, oy = origin
    ux, uy = direction
    x1, y1, x2, y2 = segments.T
    t1, t2 = (x1 - ox) * ux + (y1 - oy) * uy, (x2 - ox) * ux + (y2 - oy) * uy
    o1, o2 = np.abs((x1 - ox) * uy - (y1 - oy) * ux), np.abs((x2 - ox) * uy - (y2 - oy) * ux)
    lengths = np.maximum(np.hypot(x2 - x1, y2 - y1), 1e-9)
    # 線分の向きと直線の向きのなす角(向きの表裏は問わない)
    aligned = np.abs((x2 - x1) * ux + (y2 - y1) * uy) / lengths >= math.cos(
        math.radians(SHAFT_ALIGN_DEGREES)
    )
    return (
        (np.maximum(o1, o2) <= width)
        & (np.minimum(t1, t2) >= 0)
        & (np.maximum(t1, t2) <= max_length)
        & aligned
    )


def _fit_line(segments: np.ndarray, direction):
    """線分の端に当てた直線(線分の長さで重み付け)。(通る点, 向き)。

    向きは direction の側にそろえる
    """
    points = segments.reshape(-1, 2)
    weights = np.repeat(
        np.hypot(segments[:, 2] - segments[:, 0], segments[:, 3] - segments[:, 1]), 2
    )
    mean = (points * weights[:, None]).sum(axis=0) / weights.sum()
    spread = ((points - mean) * weights[:, None]).T @ (points - mean)
    dx, dy = np.linalg.eigh(spread)[1][:, 1]
    if dx * direction[0] + dy * direction[1] < 0:
        dx, dy = -dx, -dy
    return (float(mean[0]), float(mean[1])), (float(dx), float(dy))


def _confidence(length: float, covered: float, radius: float) -> float:
    """軸が線分で埋まっている割合。短い軸(ノックの直後で途切れた)は下げる"""
    return covered * min(1.0, length / (radius * 0.3))


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


def _distinct(arrows: list[DetectedArrow]) -> list[DetectedArrow]:
    """確からしい順に並べ、先に選んだものとほぼ同じ所に刺さった推測(割れたノック・同じ軸に乗った
    別の塊からたどったもの)を除く。画面は先頭から本数だけ入れるので、同じ矢を二度数えないように"""
    kept: list[DetectedArrow] = []
    for arrow in sorted(arrows, key=lambda arrow: -arrow.confidence):
        if all(math.dist((arrow.x, arrow.y), (k.x, k.y)) > DUPLICATE_DISTANCE for k in kept):
            kept.append(arrow)
    return kept


def detect_arrows(
    image_bgr: np.ndarray,
    fit: TargetFit,
    nock_color: str | None = None,
    fletch_color: ArrowColor | None = None,
) -> list[DetectedArrow]:
    """見つけた矢を、確からしい順に。nock_color は測ったノックの色(#rrggbb)"""
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    segments = _segments(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY))
    ranges = (
        nock_ranges(nock_color)
        if nock_color
        else [r for color in DEFAULT_NOCK_COLORS for r in COLOR_RANGES[color]]
    )
    nocks = _nocks(hsv, fit, ranges)
    max_length = fit.radius_px * MAX_SHAFT_LENGTH
    tolerance = max(3.0, fit.radius_px * SHAFT_TOLERANCE)
    arrows = []
    for nock in nocks:
        traced = _trace(nock, segments, max_length, tolerance, fit.center_px)
        if traced is None:
            continue
        end, length, covered = traced
        mapped = fit.homography @ np.array([end[0], end[1], 1.0])
        x, y = float(mapped[0] / mapped[2]), float(mapped[1] / mapped[2])
        if math.dist((x, y), (0.5, 0.5)) > MAX_ENTRY_DISTANCE:
            continue
        confidence = _confidence(length, covered, fit.radius_px)
        confidence += _fletch_bonus(hsv, nock, end, fletch_color, fit.radius_px)
        arrows.append(
            DetectedArrow(
                x=x,
                y=y,
                confidence=round(float(min(1.0, max(0.0, confidence))), 3),
            )
        )
    return _distinct(arrows)
