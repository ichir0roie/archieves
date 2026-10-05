"use client";

import { JSX, useEffect, useRef, useState } from "react";
import ScoreEntryActions from "@/components/ScoreEntryActions";
import type { ScoreInputProps } from "@/components/ScoreEntryShell";
import { ringClass } from "@/lib/score/scoreFunctions";
import {
  MAX_RING_SCORE,
  MISS_SCORE,
  X_SCORE,
  resolveTargetType,
} from "@/lib/score/scoreConfig";
import { T } from "@/lib/text";

const PADDING = 24;

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(Math.max(value, 0), 1);
}

/**
 * 得点の帯の外側の半径を、的の半径に対する割合で返す。WA の的は半径を 10 等分した帯で、
 * 内側が 10、外側が 1。X は独立した帯でなく、10 の帯の内側半分。
 */
function zoneRadiusRatio(score: number): number {
  if (score >= X_SCORE) return 1 / (MAX_RING_SCORE * 2);
  return (MAX_RING_SCORE + 1 - score) / MAX_RING_SCORE;
}

export default function TargetCircleInput(props: ScoreInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);
  const [maxDiameter, setMaxDiameter] = useState<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function updateSize() {
      if (!container) return;
      setWidth(container.clientWidth);
      setHeight(container.clientHeight);
      setMaxDiameter(
        Math.max(Math.min(container.clientWidth, container.clientHeight) - PADDING * 2, 0)
      );
    }

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const isLocked = props.isEndFull || props.disabled;

  /**
   * 押した位置を、的そのものに対する割合で返す(0.5/0.5 が中心、0 と 1 が縁)。
   * API は中心からのずれに的の実寸を掛けて x_cm/y_cm にするので、縦横比の違う入力の枠でなく
   * 的に対する割合でなければならない。的の外を押したときは縁に寄せる。
   */
  function getTargetCoordinates(event: React.MouseEvent<HTMLButtonElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || maxDiameter === 0) {
      return { relativeX: 0.5, relativeY: 0.5 };
    }
    return {
      relativeX: clampFraction(
        0.5 + (event.clientX - rect.left - rect.width / 2) / maxDiameter
      ),
      relativeY: clampFraction(
        0.5 + (event.clientY - rect.top - rect.height / 2) / maxDiameter
      ),
    };
  }

  const handleClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    point: number
  ) => {
    if (isLocked) return;
    const coordinates = getTargetCoordinates(event);
    props.next(point, coordinates.relativeX, coordinates.relativeY);
  };

  const { ringCount } = resolveTargetType(props.targetType);

  // 帯は高い点ほど内側で、外の帯より上に重ねる。押した所を覆ういちばん小さい帯に当たるように
  function circleButton(point: number) {
    const size = maxDiameter * zoneRadiusRatio(point);

    return (
      <button
        key={point}
        type="button"
        aria-label={T.game.entry.ringLabel(point)}
        disabled={isLocked}
        className={`target-ring ${ringClass(point)}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `calc(${width / 2}px - ${size / 2}px)`,
          top: `calc(${height / 2}px - ${size / 2}px)`,
          zIndex: point,
        }}
        onClick={(event) => handleClick(event, point)}
      />
    );
  }

  const circles = new Array<JSX.Element>();
  for (let i = 1; i <= ringCount; i++) {
    circles.push(circleButton(i));
  }

  /**
   * (0, 0) は点数だけの入力が押した位置の無い矢に送る値なので、描く位置が無い。
   * 印はすべての帯より上にあるので、押されても受けないようにする(.arrow-mark の pointer-events: none)。
   * でないと同じ所への二本目が的でなく一本目の印に当たる。
   */
  function createArrow(
    relativeX: number | null | undefined,
    relativeY: number | null | undefined,
    key: number
  ) {
    if (relativeX == null || relativeY == null) return null;
    if (relativeX === 0 && relativeY === 0) return null;

    return (
      <div
        key={key}
        className="arrow-mark"
        style={{
          left: `${width / 2 + (relativeX - 0.5) * maxDiameter - 5}px`,
          top: `${height / 2 + (relativeY - 0.5) * maxDiameter - 5}px`,
        }}
      />
    );
  }

  return (
    <div className="TargetCircleInput target-input">
      {props.commentBar}
      <div
        ref={containerRef}
        className={`TargetFace target-face ${isLocked ? "locked" : ""}`}
      >
        {circles}
        {props.points.map((point, index) => createArrow(point.x, point.y, index))}
        <button
          type="button"
          aria-label={T.game.entry.miss}
          disabled={isLocked}
          className="miss-area"
          onClick={(event) => handleClick(event, MISS_SCORE)}
        />
      </div>
      <ScoreEntryActions {...props} />
    </div>
  );
}
