"""写真の処理: 的の補正と矢の推測。

描いた写真(tests/photo_samples.py)で、刺さった点が分かる形で確かめる。
"""

import io
import math

import cv2
import numpy as np
import pytest
from PIL import Image

from app.core.arrow_colors import ArrowColor
from app.services import arrow_detection, photo_analysis, target_detection
from app.services.photo_analysis import DISPLAY_EXTENT, DISPLAY_MAX_PX, analyze
from tests import photo_samples as samples
from tests.photo_samples import Arrow, Sample

TRUE_POINTS = [(0.5, 0.5), (0.42, 0.6), (0.62, 0.45), (0.55, 0.7)]


def nearest(estimates, x: float, y: float) -> float:
    return min(math.dist((e.x, e.y), (x, y)) for e in estimates)


def test_a_photo_taken_at_an_angle_is_rectified_and_its_arrows_are_estimated() -> None:
    result = analyze(samples.jpeg(Sample(arrows=[Arrow(x, y) for x, y in TRUE_POINTS])))

    assert result.rectified is True
    assert result.display_extent == DISPLAY_EXTENT
    assert (result.width, result.height) == (samples.CANVAS[1], samples.CANVAS[0])
    assert Image.open(io.BytesIO(result.display_jpeg)).size == (DISPLAY_MAX_PX, DISPLAY_MAX_PX)
    assert len(result.estimates) == len(TRUE_POINTS)
    for x, y in TRUE_POINTS:
        assert nearest(result.estimates, x, y) < 0.02
    assert all(0 < e.confidence <= 1 for e in result.estimates)
    # 元の写真の px を、的に対する割合へ写す
    assert result.homography is not None
    to_target = np.array(result.homography)
    for x, y in ((0.2, 0.3), (0.7, 0.8)):
        point = samples.homography() @ np.array([x, y, 1.0])
        mapped = to_target @ (point / point[2])
        assert math.dist(mapped[:2] / mapped[2], (x, y)) < 0.01


def test_the_rectified_display_shows_the_target_upright_and_centered() -> None:
    result = analyze(samples.jpeg(Sample()))
    display = cv2.imdecode(np.frombuffer(result.display_jpeg, np.uint8), cv2.IMREAD_COLOR)
    assert display is not None
    hsv = cv2.cvtColor(display, cv2.COLOR_BGR2HSV)
    unit = DISPLAY_MAX_PX / (1 + 2 * DISPLAY_EXTENT)
    # 畳も金と同じ色相なので、中央の近くだけを見る
    gold = target_detection.ring_masks(hsv)["yellow"] > 0
    middle = np.zeros_like(gold)
    lo, hi = round(DISPLAY_MAX_PX / 2 - unit * 0.3), round(DISPLAY_MAX_PX / 2 + unit * 0.3)
    middle[lo:hi, lo:hi] = True
    ys, xs = np.nonzero(gold & middle)

    # 金の中心は表示の画像の中央、金の幅は的の 2 割
    assert abs(xs.mean() - DISPLAY_MAX_PX / 2) < 10
    assert abs(ys.mean() - DISPLAY_MAX_PX / 2) < 10
    assert abs((xs.max() - xs.min()) - unit * 0.2) < 15
    assert abs((ys.max() - ys.min()) - unit * 0.2) < 15
    assert result.estimates == []


def test_only_arrows_with_the_games_nock_color_are_taken() -> None:
    sample = Sample(
        arrows=[
            Arrow(0.5, 0.5),
            Arrow(0.42, 0.6),
            Arrow(0.62, 0.45, nock=samples.ORANGE_NOCK),
            Arrow(0.55, 0.7, nock=samples.ORANGE_NOCK),
        ]
    )

    everyone = analyze(samples.jpeg(sample))
    mine = analyze(samples.jpeg(sample), nock_color=ArrowColor.GREEN)

    assert len(everyone.estimates) == 4
    assert len(mine.estimates) == 2
    assert nearest(mine.estimates, 0.5, 0.5) < 0.02
    assert nearest(mine.estimates, 0.42, 0.6) < 0.02


def test_the_fletch_color_raises_or_lowers_the_confidence() -> None:
    photo = samples.jpeg(Sample(arrows=[Arrow(0.5, 0.5), Arrow(0.42, 0.6)]))

    plain = analyze(photo).estimates
    matching = analyze(photo, fletch_color=ArrowColor.WHITE).estimates
    # オレンジの羽根は写っていない(青は的の帯にあるので使わない)
    other = analyze(photo, fletch_color=ArrowColor.ORANGE).estimates

    assert min(e.confidence for e in matching) > max(e.confidence for e in other)
    assert sum(e.confidence for e in plain) > sum(e.confidence for e in other)


def test_lookalikes_around_the_target_are_not_taken() -> None:
    sample = Sample(
        arrows=[
            Arrow(0.5, 0.5),
            # 軸の短すぎる矢(ノックの直後で途切れる)は、推測にしない
            Arrow(0.62, 0.45, offset=(4.0, 14.0)),
            # 的から離れすぎた所で終わる軸(台・背景の色の塊からたどった線)も、推測にしない
            Arrow(-0.25, 0.3),
        ],
        blobs=[
            # 赤に囲まれない黄の丸
            ((150, 1450), 60, samples.GOLD),
            # 的から遠い緑の塊・軸の無い緑の塊・光で割れた一つのノック(近い二つの塊)
            ((1150, 1550), 10, samples.GREEN_NOCK),
            ((420, 1180), 10, samples.GREEN_NOCK),
            ((900, 1300), 4, samples.GREEN_NOCK),
            ((914, 1300), 4, samples.GREEN_NOCK),
        ],
        # 畳は金と同じ色相で、背景ごと一つの塊になるので、ここでは灰色にして黄の帯を別に置く
        background=(128, 128, 128),
    )
    image = samples.draw(sample)
    # 細長い黄の帯(畳のへり・的の外の黄色いもの)
    cv2.rectangle(image, (0, 0), (1199, 120), samples.GOLD, -1)
    _, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 95])

    result = analyze(encoded.tobytes())

    assert result.rectified is True
    assert len(result.estimates) == 1
    assert nearest(result.estimates, 0.5, 0.5) < 0.02


def test_a_target_on_a_blue_background_is_rectified_from_the_red_ring() -> None:
    result = analyze(samples.jpeg(Sample(arrows=[Arrow(0.5, 0.5)], background=samples.BLUE)))

    assert result.rectified is True
    assert nearest(result.estimates, 0.5, 0.5) < 0.03


def test_a_photo_without_a_target_is_only_shrunk() -> None:
    result = analyze(samples.jpeg(Sample(with_target=False)))

    assert result.rectified is False
    assert result.homography is None
    assert result.estimates == []
    # 長辺が 2000px に満たないので、縮めずにそのまま
    assert Image.open(io.BytesIO(result.display_jpeg)).size == (1200, 1600)


def test_gold_on_a_red_field_is_not_a_target() -> None:
    sample = Sample(
        with_target=False, background=samples.RED, blobs=[((600, 800), 80, samples.GOLD)]
    )

    assert analyze(samples.jpeg(sample)).rectified is False


def test_no_segments_are_found_in_a_blank_image() -> None:
    assert arrow_detection._segments(np.zeros((50, 50), np.uint8)).shape == (0, 4)


def test_the_vanishing_direction_follows_the_shafts() -> None:
    assert arrow_detection._vanishing([((0, 0), (0, 10))]) is None

    parallel = arrow_detection._vanishing([((0, 0), (0, 10)), ((5, 0), (5, 10))])
    assert parallel is not None
    assert parallel(100, 100) == pytest.approx(math.pi / 2)

    # 二本の軸は (0, 100) へ向かう
    converging = arrow_detection._vanishing([((-10, 0), (-5, 50)), ((10, 0), (5, 50))])
    assert converging is not None
    assert converging(0, 0) == pytest.approx(math.pi / 2)
    # 消失点より先(後ろ側)の点では、向きの平均を使う
    assert converging(0, 200) == pytest.approx(math.pi / 2)
    assert converging(-30, 0) == pytest.approx(math.atan2(100, 30))


def test_the_fletch_is_not_looked_for_outside_the_image() -> None:
    hsv = np.zeros((40, 40, 3), np.uint8)

    bonus = arrow_detection._fletch_bonus(hsv, (-200, -200), (-150, -150), ArrowColor.WHITE, 50)

    assert bonus == 0.0


def test_the_analyzer_version_is_kept_with_the_results() -> None:
    assert photo_analysis.ANALYZER_VERSION == "rings-2"


def true_alignment() -> list[list[float]]:
    """描いた写真の、合わせる 4 点の本当の位置(写真の幅・高さに対する割合)"""
    height, width = samples.CANVAS
    points = []
    for x, y in target_detection.ALIGNMENT_TARGET_POINTS:
        mapped = samples.homography() @ np.array([x, y, 1.0])
        points.append([mapped[0] / mapped[2] / width, mapped[1] / mapped[2] / height])
    return points


def test_the_alignment_points_follow_the_automatic_rectification() -> None:
    result = analyze(samples.jpeg(Sample()))

    assert result.homography is not None
    points = target_detection.alignment_points(
        np.array(result.homography), result.width, result.height
    )
    for got, expected in zip(points, true_alignment(), strict=True):
        assert math.dist(got, expected) < 0.01


def test_points_aligned_by_hand_rectify_a_photo_whose_target_is_not_found() -> None:
    # 色の帯の無い的(白黒に写った・色あせた)は見つからないが、手で合わせた 4 点で補正できる
    sample = Sample(arrows=[Arrow(0.5, 0.5), Arrow(0.42, 0.6)])
    gray = cv2.cvtColor(cv2.cvtColor(samples.draw(sample), cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    # ノックの色は残す(白黒にした写真に、緑の丸を描き直す)
    for arrow in sample.arrows:
        point = samples.homography() @ np.array([arrow.x, arrow.y, 1.0])
        nock = (round(point[0] / point[2] + 70), round(point[1] / point[2] + 230))
        cv2.circle(gray, nock, 11, samples.GREEN_NOCK, -1)
    _, encoded = cv2.imencode(".jpg", gray, [cv2.IMWRITE_JPEG_QUALITY, 95])

    assert analyze(encoded.tobytes()).rectified is False

    result = analyze(encoded.tobytes(), alignment=true_alignment())

    assert result.rectified is True
    assert len(result.estimates) == 2
    assert nearest(result.estimates, 0.5, 0.5) < 0.02
    assert nearest(result.estimates, 0.42, 0.6) < 0.02
