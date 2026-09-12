"use client";

import { JSX, useEffect, useRef, useState } from "react";
import ScoreEntryActions from "@/components/templates/score/scoreInput/ScoreEntryActions";
import type { ScoreInputProps } from "@/components/templates/score/ScoreEntryShell";
import { bgColorPallet } from "@/modules/data/score/scoreFunctions";
import {
  MAX_RING_SCORE,
  MISS_SCORE,
  X_SCORE,
  resolveTargetType,
} from "@/modules/data/score/scoreConfig";

const PADDING = 24;

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Outer radius of a scoring zone as a fraction of the face's own radius. A
 * WA face splits its radius into ten equal rings, 10 innermost and 1
 * outermost; X is not a ring of its own but the inner half of the 10 ring.
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
   * Where the arrow was tapped, as a fraction of the target face itself -
   * 0.5/0.5 is the centre, 0 and 1 are its edges. The API multiplies the
   * offset from the centre by the face's real size to store x_cm/y_cm, so
   * the fraction has to be of the face rather than of the (differently
   * proportioned) input area around it. A tap outside the face is clamped
   * to its edge.
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

  // Rings are nested, highest score innermost, each stacked above the ring
  // outside it so a tap always lands on the smallest one covering it.
  function circleButton(point: number) {
    const size = maxDiameter * zoneRadiusRatio(point);

    return (
      <button
        key={point}
        aria-label={`${point}点`}
        disabled={isLocked}
        className={`absolute rounded-full ${bgColorPallet(point)} border-1 border-gray-500`}
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
   * (0, 0) is what the score-only input mode sends when no tap ever
   * happened, so an arrow carrying it has no position to draw. Markers sit
   * above every ring, so they must not take pointer events of their own -
   * otherwise the second arrow into the same spot would hit the first
   * arrow's marker instead of the target.
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
        style={{
          left: `${width / 2 + (relativeX - 0.5) * maxDiameter - 5}px`,
          top: `${height / 2 + (relativeY - 0.5) * maxDiameter - 5}px`,
          width: "10px",
          height: "10px",
          backgroundColor: "white",
          borderRadius: "50%",
          position: "absolute",
          zIndex: 100,
          pointerEvents: "none",
          border: "2px solid black",
        }}
        key={key}
      />
    );
  }

  return (
    <div className="TargetCircleInput flex h-full w-full flex-col">
      {props.commentBar}
      <div
        ref={containerRef}
        className={`TargetFace relative min-h-0 flex-1 ${isLocked ? "opacity-60" : ""}`}
      >
        {circles}
        {props.points.map((point, index) => createArrow(point.x, point.y, index))}
        <button
          aria-label="外れ"
          disabled={isLocked}
          className="absolute inset-0"
          style={{ zIndex: 0 }}
          onClick={(event) => handleClick(event, MISS_SCORE)}
        />
      </div>
      <ScoreEntryActions {...props} />
    </div>
  );
}
