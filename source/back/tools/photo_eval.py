"""写真の矢の推測を、手で付けた正解(photo_eval_labels.json)と比べて点数を出す。

    .venv/bin/python -m tools.photo_eval <写真のフォルダ> [--overlay <画像を書き出すフォルダ>]

画面は推測を確からしい順に受け、エンドの本数だけを先頭から矢として入れる(scoreManager.applyEstimates)。
それに合わせ、写真ごとに推測の上位 K 本(K = 正解の本数)を正解と 1 対 1 で組み、
点数が合った本数を数える。

- 正解は、的に対する割合(左上が 0、中心が 0.5)。補正した正面の画像に格子を描いて読んだもので、
  読み取りの誤差はおよそ 0.007
- 組み方は、距離の近い組から順に決める(本数が少ないので、最適な割り当てとの差は小さい)
- 点数は中心からの距離だけで決める(1 点の帯は 0.05)。矢の太さ・インサイドアウトは見ない
- 写真は持たない(利用者の写真なのでリポジトリに置かない)。フォルダを引数で渡す
- 写真は、撮るときの決まり(的の全体が写る・矢がなるべく重ならない)を守ったものだけにする。
  矢が重なって刺さった点が隠れた写真は、正解を読み切れないので入れない
- 写真モードはノックの色の登録が要るので、写真ごとのノックの色(nock_colors。拾えたノックの鮮やかな
  画素から測った値で、登録の画面で何本か押すのに近い)を渡して処理する
- tune は数字を決めるのに使った写真、check は決めるのに使っていない確かめ用の写真。
  数字を変えたら、check でも上がるかを見る(tune だけで上がるのは、写真に合わせ込んだだけ)
"""

import argparse
import json
import logging
import math
import statistics
import time
from pathlib import Path

import cv2
import numpy as np

from app.services.photo_analysis import analyze

logger = logging.getLogger(__name__)

LABELS_PATH = Path(__file__).resolve().parent / "photo_eval_labels.json"
RING_WIDTH = 0.05
# 正解に近いとみなす距離。半分の帯と 1 つの帯
NEAR = 0.025
WITHIN_RING = 0.05


def ring(x: float, y: float) -> int:
    return max(0, 10 - math.floor(math.dist((x, y), (0.5, 0.5)) / RING_WIDTH))


def match(truths: list[list[float]], estimates: list[tuple[float, float]]) -> list[int | None]:
    """正解ごとに、組んだ推測の番号。組めなかった正解は None"""
    pairs = sorted(
        (math.dist(t, e), i, j) for i, t in enumerate(truths) for j, e in enumerate(estimates)
    )
    used_t: set[int] = set()
    used_e: set[int] = set()
    matched: list[int | None] = [None] * len(truths)
    for _, i, j in pairs:
        if i in used_t or j in used_e:
            continue
        used_t.add(i)
        used_e.add(j)
        matched[i] = j
    return matched


def draw_overlay(path: Path, result, truths, estimates) -> None:
    display = cv2.imdecode(np.frombuffer(result.display_jpeg, np.uint8), cv2.IMREAD_COLOR)
    if display is None:
        logger.warning("display image of %s is unreadable", path.name)
        return
    extent = result.display_extent or 0.0
    unit = display.shape[1] / (1 + 2 * extent)

    def px(x: float, y: float) -> tuple[int, int]:
        return round((x + extent) * unit), round((y + extent) * unit)

    for x, y in truths:
        cv2.circle(display, px(x, y), 14, (0, 255, 0), 3)
    for rank, (x, y) in enumerate(estimates, start=1):
        cv2.drawMarker(display, px(x, y), (0, 0, 255), cv2.MARKER_TILTED_CROSS, 28, 4)
        cv2.putText(
            display,
            str(rank),
            (px(x, y)[0] + 10, px(x, y)[1] - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 0, 255),
            2,
        )
    cv2.imwrite(str(path), display, [cv2.IMWRITE_JPEG_QUALITY, 85])


COLUMNS = ("本数", "点数一致", "半帯内", "1帯内", "全推測で1帯内")


def evaluate(result, truths: list[list[float]]) -> tuple[dict[str, int], list[float], list]:
    """一枚の写真の数。(欄ごとの数, 組んだ正解と推測の距離, 上位 K 本の推測)"""
    top = [(e.x, e.y) for e in result.estimates[: len(truths)]]
    pairs = [(t, top[j]) for t, j in zip(truths, match(truths, top), strict=True) if j is not None]
    distances = [math.dist(t, e) for t, e in pairs]
    everything = [(e.x, e.y) for e in result.estimates]
    counts = {
        "本数": len(truths),
        "点数一致": sum(ring(*t) == ring(*e) for t, e in pairs),
        "半帯内": sum(d <= NEAR for d in distances),
        "1帯内": sum(d <= WITHIN_RING for d in distances),
        # 順位を問わず、どれかの推測が 1 帯以内にある正解。見つけたのに上位に来なかったものを分ける
        "全推測で1帯内": sum(
            any(math.dist(t, e) <= WITHIN_RING for e in everything) for t in truths
        ),
    }
    return counts, distances, top


def main() -> None:
    parser = argparse.ArgumentParser(description="写真の矢の推測を、手で付けた正解と比べる")
    parser.add_argument(
        "photos",
        type=Path,
        help="正解の写真のあるフォルダ",
    )
    parser.add_argument(
        "--overlay",
        type=Path,
        default=None,
        help="正解(緑の丸)と上位 K 本の推測(赤の×と順位)を補正した画像に描いて書き出すフォルダ",
    )
    args = parser.parse_args()
    # tune は数字を決めるのに使った写真、check は決めるのに使っていない確かめ用の写真
    label_sets = json.loads(LABELS_PATH.read_text(encoding="utf-8"))
    nock_colors = label_sets.pop("nock_colors")
    if args.overlay:
        args.overlay.mkdir(parents=True, exist_ok=True)

    print(f"{'写真':<26}" + "".join(f"{c:>8}" for c in COLUMNS) + f"{'秒':>6}")
    summaries = []
    for set_name, labels in label_sets.items():
        totals = dict.fromkeys(COLUMNS, 0)
        errors: list[float] = []
        for name, truths in labels.items():
            started = time.perf_counter()
            result = analyze((args.photos / name).read_bytes(), nock_colors[name])
            seconds = time.perf_counter() - started
            counts, distances, top = evaluate(result, truths)
            for column in COLUMNS:
                totals[column] += counts[column]
            errors += distances
            print(f"{name:<26}" + "".join(f"{counts[c]:>8}" for c in COLUMNS) + f"{seconds:>6.1f}")
            if args.overlay:
                draw_overlay(args.overlay / f"{name}.jpg", result, truths, top)
        total = totals["本数"]
        summaries.append(
            f"{set_name}: "
            + "  ".join(f"{c} {totals[c]}/{total} ({totals[c] / total:.0%})" for c in COLUMNS[1:])
            + f"  誤差の中央値 {statistics.median(errors) if errors else float('nan'):.3f}"
        )
    print("\n".join(summaries))


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    main()
