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
    # ノックの色は、矢の写真から測った色(描いたノックの色)
    green = analyze(samples.jpeg(sample), nock_color="#3cff28")
    orange = analyze(samples.jpeg(sample), nock_color="#ff7800")

    assert len(everyone.estimates) == 4
    assert len(green.estimates) == 2
    assert nearest(green.estimates, 0.5, 0.5) < 0.02
    assert nearest(green.estimates, 0.42, 0.6) < 0.02
    assert len(orange.estimates) == 2
    assert nearest(orange.estimates, 0.62, 0.45) < 0.02
    assert nearest(orange.estimates, 0.55, 0.7) < 0.02


def test_a_measured_nock_color_is_looked_for_around_its_hue() -> None:
    # 赤は色相の 0 と 180 をまたぐので、両側を探す
    red = arrow_detection.nock_ranges("#e02020")
    assert len(red) == 2
    assert {low[0] for low, _ in red} | {high[0] for _, high in red} >= {0, 180}
    # 赤紫は色相の 180 をまたぐ
    magenta = arrow_detection.nock_ranges("#ff2050")
    assert len(magenta) == 2
    assert {low[0] for low, _ in magenta} | {high[0] for _, high in magenta} >= {0, 180}
    # 白は色相が決まらないので、明るさで探す
    [(low, high)] = arrow_detection.nock_ranges("#f5f5f5")
    assert (low[0], high[0]) == (0, 180)
    assert high[1] <= arrow_detection.ACHROMATIC_SATURATION
    assert low[2] > 150


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
            # 的から離れすぎた所で終わる軸(台・背景の色の塊からたどった線)も、推測にしない。
            # 的の側へ向かう線(的と逆へ向かう線は、たどる向きで先に弾く)
            Arrow(-0.2, 0.3, offset=(-70.0, 25.0)),
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


def test_a_shaft_hidden_in_places_is_followed_to_where_it_enters_the_target() -> None:
    # ノック (0, 0) から上(的の中心の側)へ伸びる軸。途中の 80px は羽根・印字で見えず、
    # 300px で的に刺さる。その先に離れて一つある短い線分(的の線・穴の縁)までは行かない
    segments = np.array(
        [
            [0, -20, 0, -100],
            [0, -180, 0, -300],
            [0, -360, 0, -372],
        ],
        dtype=float,
    )

    traced = arrow_detection._trace((0, 0), segments, 500, 3, center=(0, -1000))

    assert traced is not None
    (x, y), length, _ = traced
    assert abs(x) < 1
    assert length == pytest.approx(300, abs=4)


def test_short_edges_across_the_shaft_line_are_not_taken_for_the_shaft() -> None:
    # 軸は 200px で的に刺さる。その先の穴の縁(短く、軸と向きの違う線分)が軸の延長の幅の中に
    # 並んでいても、軸が続いているとはみなさない
    shaft = [[0, -20, 0, -200]]
    holes = [[-6, -215 - 15 * i, 6, -224 - 15 * i] for i in range(8)]
    segments = np.array(shaft + holes, dtype=float)

    traced = arrow_detection._trace((0, 0), segments, 500, 8, center=(0, -1000))

    assert traced is not None
    assert traced[1] == pytest.approx(200, abs=4)


def test_the_shaft_line_is_fitted_to_the_segments_on_it() -> None:
    # ノックの中心が軸から少しずれていても、軸の線分に当てた直線で遠くまでたどる
    segments = np.array(
        [[0, -20 - 60 * i, 0.5, -60 - 60 * i] for i in range(7)],
        dtype=float,
    )

    traced = arrow_detection._trace((5, 0), segments, 500, 3, center=(0, -1000))

    assert traced is not None
    (x, y), _, _ = traced
    assert abs(x) < 2
    assert y == pytest.approx(-420, abs=4)


def test_a_line_leading_away_from_the_target_is_not_followed() -> None:
    # ノックから的と逆の向きへ伸びる線(畳の筋・台の縁)はたどらない
    segments = np.array([[0, 20, 0, 300]], dtype=float)

    assert arrow_detection._trace((0, 0), segments, 500, 3, center=(0, -1000)) is None


def radiating_arrow(x: float, y: float, vanishing: tuple[float, float], length: float) -> Arrow:
    """刺さった点から、消失点(的に対する割合)と逆の向きへ length px 伸びた矢"""
    to_photo = samples.homography()

    def photo(px: float, py: float) -> tuple[float, float]:
        point = to_photo @ np.array([px, py, 1.0])
        return point[0] / point[2], point[1] / point[2]

    ex, ey = photo(x, y)
    vx, vy = photo(*vanishing)
    distance = math.dist((ex, ey), (vx, vy))
    return Arrow(x, y, offset=((ex - vx) / distance * length, (ey - vy) / distance * length))


def test_a_nock_beside_the_center_is_traced_toward_where_the_shafts_meet(monkeypatch) -> None:
    # 軸はどれも、左下の外(矢の向きの消失点)から放射状に伸びる。中心の真下のノックは、
    # 的の中心への向き(上)と軸の向き(左)が 60 度より大きくずれる
    vanishing = (-0.3, 0.9)
    arrows = [
        radiating_arrow(0.3, 0.35, vanishing, 230),
        radiating_arrow(0.65, 0.3, vanishing, 230),
        radiating_arrow(0.7, 0.6, vanishing, 230),
        radiating_arrow(0.5, 0.8, vanishing, 90),
    ]
    photo = samples.jpeg(Sample(arrows=arrows))

    estimates = analyze(photo).estimates

    assert len(estimates) == 4
    assert nearest(estimates, 0.5, 0.8) < 0.02
    # たどれた軸から消失点を求めなければ、その矢は拾えない
    monkeypatch.setattr(arrow_detection, "_vanishing_point", lambda lines: None)
    assert nearest(analyze(photo).estimates, 0.5, 0.8) > 0.05


def test_the_point_where_the_shafts_meet_is_found_only_from_lines_that_spread() -> None:
    lines = [
        ((100.0, 0.0), (-1.0, 0.0), 1.0),
        ((0.0, 100.0), (0.0, -1.0), 1.0),
        ((70.0, 70.0), (-math.sqrt(0.5), -math.sqrt(0.5)), 0.5),
    ]

    vanishing = arrow_detection._vanishing_point(lines)

    assert vanishing == (pytest.approx(0, abs=1e-6), pytest.approx(0, abs=1e-6))
    # 1 本だけ・平行な軸からは決まらない
    assert arrow_detection._vanishing_point(lines[:1]) is None
    parallel = [((0.0, float(i)), (1.0, 0.0), 1.0) for i in range(3)]
    assert arrow_detection._vanishing_point(parallel) is None


def test_estimates_on_the_same_spot_are_taken_once_in_order_of_confidence() -> None:
    DetectedArrow = arrow_detection.DetectedArrow
    arrows = [
        DetectedArrow(0.50, 0.50, 0.4),
        DetectedArrow(0.505, 0.50, 0.9),
        DetectedArrow(0.60, 0.40, 0.6),
    ]

    distinct = arrow_detection._distinct(arrows)

    assert [(a.x, a.y) for a in distinct] == [(0.505, 0.50), (0.60, 0.40)]


def test_the_fletch_is_not_looked_for_outside_the_image() -> None:
    hsv = np.zeros((40, 40, 3), np.uint8)

    bonus = arrow_detection._fletch_bonus(hsv, (-200, -200), (-150, -150), ArrowColor.WHITE, 50)

    assert bonus == 0.0


def test_the_analyzer_version_is_kept_with_the_results() -> None:
    assert photo_analysis.ANALYZER_VERSION == "shafts-2"


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
