"""テスト用の、的と矢の写った写真を描く。刺さった点が分かっているので、推測の確かめに使う。

的を正面から描いてから、斜めから撮ったように射影で歪め、畳の色の背景に置く。矢は、刺さった点から
同じ向き(カメラから見て下へ)に伸ばした軸、羽根、ノックで描く。
"""

from dataclasses import dataclass, field

import cv2
import numpy as np

FACE_PX = 1000
CANVAS = (1600, 1200)  # 高さ・幅

# BGR。色相は target_detection.ring_masks・arrow_detection.COLOR_RANGES の範囲に入るもの
WHITE = (245, 245, 245)
BLACK = (35, 35, 35)
BLUE = (225, 160, 30)
RED = (40, 40, 225)
GOLD = (40, 215, 250)
TATAMI = (60, 125, 150)
GREEN_NOCK = (40, 255, 60)
ORANGE_NOCK = (0, 120, 255)
SHAFT = (25, 25, 25)

# 的(FACE_PX 四方)の四隅を置く所。上が狭い台形で、下から見上げて撮ったように歪める
CORNERS = [(260, 330), (980, 360), (1060, 1250), (170, 1210)]


@dataclass
class Arrow:
    # 刺さった点(的に対する割合)
    x: float
    y: float
    nock: tuple[int, int, int] = GREEN_NOCK
    fletch: tuple[int, int, int] = WHITE
    # 刺さった点からノックまで(写真の px)
    offset: tuple[float, float] = (70.0, 230.0)


@dataclass
class Sample:
    arrows: list[Arrow] = field(default_factory=list)
    # 背景の塊(的と紛らわしいもの)。(中心, 半径, 色)
    blobs: list[tuple[tuple[int, int], int, tuple[int, int, int]]] = field(default_factory=list)
    background: tuple[int, int, int] = TATAMI
    with_target: bool = True


def face() -> np.ndarray:
    image = np.full((FACE_PX, FACE_PX, 3), WHITE, np.uint8)
    colors = [WHITE, WHITE, BLACK, BLACK, BLUE, BLUE, RED, RED, GOLD, GOLD]
    for score, color in zip(range(1, 11), colors, strict=True):
        radius = round(FACE_PX / 2 * (11 - score) / 10)
        cv2.circle(image, (FACE_PX // 2, FACE_PX // 2), radius, color, -1, cv2.LINE_AA)
    return image


def homography() -> np.ndarray:
    """的の割合 → 写真の px"""
    source = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=np.float32)
    return cv2.getPerspectiveTransform(source, np.array(CORNERS, dtype=np.float32))


def draw(sample: Sample) -> np.ndarray:
    height, width = CANVAS
    canvas = np.full((height, width, 3), sample.background, np.uint8)
    to_photo = homography()
    if sample.with_target:
        scale = np.diag([1 / FACE_PX, 1 / FACE_PX, 1.0])
        warped = cv2.warpPerspective(face(), to_photo @ scale, (width, height))
        mask = cv2.warpPerspective(
            np.full((FACE_PX, FACE_PX), 255, np.uint8), to_photo @ scale, (width, height)
        )
        canvas[mask > 0] = warped[mask > 0]
    for center, radius, color in sample.blobs:
        cv2.circle(canvas, center, radius, color, -1)
    for arrow in sample.arrows:
        point = to_photo @ np.array([arrow.x, arrow.y, 1.0])
        ex, ey = point[0] / point[2], point[1] / point[2]
        nx, ny = ex + arrow.offset[0], ey + arrow.offset[1]
        cv2.line(canvas, (round(ex), round(ey)), (round(nx), round(ny)), SHAFT, 6, cv2.LINE_AA)
        # 羽根はノックから軸の 1/4 くらいまでの、軸の両側の三角
        dx, dy = (ex - nx) / 4, (ey - ny) / 4
        for side in (1, -1):
            tip = (nx + dx - side * dy * 0.4, ny + dy + side * dx * 0.4)
            triangle = np.array([[nx, ny], [nx + dx, ny + dy], tip], dtype=np.int32)
            cv2.fillConvexPoly(canvas, triangle, arrow.fletch)
        cv2.circle(canvas, (round(nx), round(ny)), 11, arrow.nock, -1)
    return canvas


def jpeg(sample: Sample) -> bytes:
    ok, encoded = cv2.imencode(".jpg", draw(sample), [cv2.IMWRITE_JPEG_QUALITY, 95])
    assert ok
    return encoded.tobytes()
