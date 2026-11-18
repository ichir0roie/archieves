"""写真の中の的を見つけ、的を正面から見た形へ写すホモグラフィを求める。

1. 色の帯(金・赤・青)の塊を取る。畳は金と同じ色相なので、「丸く詰まっていて、
   まわりを赤が囲む」金の塊を的の中心として選ぶ(両隣の的が写っていても、画像の中央に近いもの)
2. 金・金+赤・金+赤+青 の外形に楕円を当てはめる。矢・穴で欠けた所は凸包で埋める
3. 同心円の像の性質で、斜めから撮った歪み(射影)を戻す。本当の中心の像は、二つの楕円の極線が
   同じになる点(一般化固有ベクトル)で、その極線が消失線になる。消失線を無限遠へ送ってから、
   外側の楕円を円にする
4. 回転は決まらないので、画像の上が的の上になるよう回す

座標は、的に対する割合(左上が 0、中心が 0.5、的の縁までが 0.5)。入力の画面の矢の x・y と同じ。
"""

import math
from dataclasses import dataclass

import cv2
import numpy as np

# 帯の外側の半径(的の半径に対する割合)。金の外は 9 点の外、赤の外は 7 点の外、青の外は 5 点の外
RING_RADIUS = {"yellow": 0.2, "red": 0.4, "blue": 0.6}
# 楕円の大きさの比の、受ける幅。外れた当てはめ(帯が矢・影で切れた)を捨てる
RING_RATIO_TOLERANCE = (0.75, 1.3)


@dataclass(frozen=True)
class TargetFit:
    # 画像の px を、的に対する割合へ写す 3x3
    homography: np.ndarray
    # 画像の上での、的の中心の像と的の半径のおよその px
    center_px: tuple[float, float]
    radius_px: float


def ring_masks(hsv: np.ndarray) -> dict[str, np.ndarray]:
    h, s, v = cv2.split(hsv)
    # 蛍光の緑のノックを金に入れないよう、金の色相は狭くする
    yellow = (h >= 15) & (h <= 34) & (s >= 70) & (v >= 90)
    red = ((h <= 8) | (h >= 165)) & (s >= 80) & (v >= 70)
    blue = (h >= 88) & (h <= 112) & (s >= 80) & (v >= 70)
    return {
        key: mask.astype(np.uint8) * 255
        for key, mask in (("yellow", yellow), ("red", red), ("blue", blue))
    }


def _close(mask: np.ndarray, size: int) -> np.ndarray:
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)


def fit_outer_ellipse(region: np.ndarray) -> tuple:
    """塗った領域のいちばん大きな塊の外形に、楕円を当てはめる。欠けた所は凸包で埋める"""
    contours, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    hull = cv2.convexHull(max(contours, key=cv2.contourArea)).reshape(-1, 2).astype(np.float64)
    # 凸包の頂点はまばらなので、辺に沿って点を足してから当てはめる
    # 呼ぶ側は数百 px 以上の塊だけを渡すので、当てはめに要る 5 点は必ずそろう
    points = [
        p + (q - p) * t
        for p, q in zip(hull, np.roll(hull, -1, axis=0), strict=True)
        for t in np.linspace(0, 1, max(int(np.linalg.norm(q - p) / 3), 1), endpoint=False)
    ]
    return cv2.fitEllipse(np.array(points, dtype=np.float32))


def _find_gold(yellow: np.ndarray, red: np.ndarray) -> np.ndarray | None:
    """金の塊。丸く詰まっていて、まわりを赤が囲むもの。いくつもあれば画像の中央に近い大きいもの"""
    height, width = yellow.shape
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(yellow)
    best, best_score = None, 0.0
    for i in range(1, count):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < 300:
            continue
        component = (labels == i).astype(np.uint8) * 255
        ellipse = fit_outer_ellipse(component)
        a, b = ellipse[1][0] / 2, ellipse[1][1] / 2
        if min(a, b) < 5 or max(a, b) / min(a, b) > 3 or area / (math.pi * a * b) < 0.5:
            continue
        # 金の外に、金と同じくらいの幅の帯を取り、赤の割合を見る
        outer = np.zeros_like(component)
        cv2.ellipse(
            outer, (ellipse[0], (ellipse[1][0] * 2, ellipse[1][1] * 2), ellipse[2]), 255, -1
        )
        inner = np.zeros_like(component)
        cv2.ellipse(
            inner, (ellipse[0], (ellipse[1][0] * 1.15, ellipse[1][1] * 1.15), ellipse[2]), 255, -1
        )
        band = (outer > 0) & (inner == 0)
        red_ratio = float((red[band] > 0).mean())
        if red_ratio < 0.3:
            continue
        distance = math.dist(centroids[i], (width / 2, height / 2))
        score = red_ratio * math.sqrt(area) / (1 + distance / max(width, height))
        if score > best_score:
            best, best_score = component, score
    return best


def _conic(ellipse) -> np.ndarray:
    """楕円の 3x3 の円錐行列(点 x で x^T C x = 0)"""
    (cx, cy), (w, h), angle = ellipse
    t = math.radians(angle)
    rotation = np.array([[math.cos(t), -math.sin(t)], [math.sin(t), math.cos(t)]])
    m = rotation @ np.diag([4 / w**2, 4 / h**2]) @ rotation.T
    center = np.array([cx, cy])
    conic = np.zeros((3, 3))
    conic[:2, :2] = m
    conic[:2, 2] = conic[2, :2] = -m @ center
    conic[2, 2] = center @ m @ center - 1
    return conic


def _true_center(outer: np.ndarray, inner: np.ndarray, guess: np.ndarray) -> np.ndarray:
    """同心円の像の、本当の中心の像。二つの円錐で極線が同じになる点(一般化固有ベクトル)のうち、
    楕円の中心に近いもの。見つからなければ楕円の中心"""
    _, vectors = np.linalg.eig(np.linalg.solve(inner, outer))
    # 実数で、無限遠でない固有ベクトルだけを点にする
    usable = (np.abs(vectors.imag).max(axis=0) <= 1e-9) & (np.abs(vectors[2]) > 1e-12)
    points = (vectors.real[:2, usable] / vectors.real[2, usable]).T
    distances = np.linalg.norm(points - guess, axis=1)
    return points[distances.argmin()] if len(points) else guess


def _homography(ellipses: dict, scale: float) -> tuple[np.ndarray, np.ndarray]:
    outer_key = "blue" if "blue" in ellipses else "red"
    outer = _conic(ellipses[outer_key])
    guess = np.array(ellipses[outer_key][0])
    centers = [
        _true_center(outer, _conic(ellipses[key]), guess)
        for key in ("yellow", "red")
        if key in ellipses and key != outer_key
    ]
    # 外れた中心(帯の当てはめが崩れた)は使わない
    near = [c for c in centers if np.linalg.norm(c - guess) < 0.2 * max(ellipses[outer_key][1])]
    center = np.mean(near, axis=0) if near else guess

    # 消失線(中心の極線)を無限遠へ送る。数値が安定するよう、画像の大きさで割ってから
    normalize = np.diag([1 / scale, 1 / scale, 1.0])
    line = np.linalg.inv(normalize).T @ outer @ np.array([center[0], center[1], 1.0])
    line = line / line[2]
    projective = np.array([[1, 0, 0], [0, 1, 0], line]) @ normalize
    # 送ったあとの外側の楕円を、単位円にするアフィン
    conic = np.linalg.inv(projective).T @ outer @ np.linalg.inv(projective)
    m = conic[:2, :2]
    ellipse_center = -np.linalg.solve(m, conic[:2, 2])
    values, vectors = np.linalg.eigh(m / (ellipse_center @ m @ ellipse_center - conic[2, 2]))
    # 鏡映にならないよう、固有ベクトルの向きをそろえる
    vectors[:, 1] *= np.sign(np.linalg.det(vectors))
    linear = np.diag(np.sqrt(values)) @ vectors.T
    affine = np.eye(3)
    affine[:2, :2] = linear
    affine[:2, 2] = -linear @ ellipse_center
    # 外側の帯の半径に合わせ、中心を 0.5 に置く
    r = RING_RADIUS[outer_key] / 2
    homography = np.array([[r, 0, 0.5], [0, r, 0.5], [0, 0, 1]]) @ affine @ projective

    # 画像で中心の真上の点が、的でも真上に来るよう回す
    def apply(point):
        mapped = homography @ np.array([point[0], point[1], 1.0])
        return mapped[:2] / mapped[2]

    middle = apply(center)
    above = apply(center - np.array([0, scale * 0.05]))
    angle = math.atan2(above[0] - middle[0], middle[1] - above[1])
    c, s = math.cos(angle), math.sin(angle)
    rotate = np.array(
        [[c, s, 0.5 - 0.5 * c - 0.5 * s], [-s, c, 0.5 + 0.5 * s - 0.5 * c], [0, 0, 1]]
    )
    return rotate @ homography, center


def find_target(image_bgr: np.ndarray) -> TargetFit | None:
    """画像の中の的。見つからなければ None"""
    height, width = image_bgr.shape[:2]
    hsv = cv2.cvtColor(cv2.GaussianBlur(image_bgr, (5, 5), 0), cv2.COLOR_BGR2HSV)
    masks = ring_masks(hsv)
    # 矢・穴で切れた帯をつなぐ幅
    gap = max(9, max(height, width) // 60)
    gold = _find_gold(_close(masks["yellow"], gap), masks["red"])
    if gold is None:
        return None
    # 帯ごとに、金の塊と重なる塊を選ぶ(畳の黄は使わない)
    regions = {
        "yellow": gold,
        "red": gold | masks["red"],
        "blue": gold | masks["red"] | masks["blue"],
    }
    ellipses = {}
    for key, region in regions.items():
        _, labels = cv2.connectedComponents(_close(region, gap))
        label = np.bincount(labels[gold > 0]).argmax()
        ellipses[key] = fit_outer_ellipse((labels == label).astype(np.uint8) * 255)
    # 帯の大きさの比で、当てはめの外れを捨てる(赤の外は金の外の 2 倍、青の外は 3 倍)
    gold_size = sum(ellipses["yellow"][1])
    low, high = RING_RATIO_TOLERANCE
    for key in ("red", "blue"):
        expected = RING_RADIUS[key] / RING_RADIUS["yellow"]
        if key in ellipses and not (
            expected * low < sum(ellipses[key][1]) / gold_size < expected * high
        ):
            del ellipses[key]
    if "red" not in ellipses and "blue" not in ellipses:
        return None
    homography, center = _homography(ellipses, float(max(height, width)))
    outer_key = "blue" if "blue" in ellipses else "red"
    radius = sum(ellipses[outer_key][1]) / 4 / RING_RADIUS[outer_key]
    return TargetFit(
        homography=homography,
        center_px=(float(center[0]), float(center[1])),
        radius_px=float(radius),
    )
