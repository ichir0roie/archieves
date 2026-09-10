"use client";

import { Button } from "@mui/material";
import { JSX, useEffect, useRef, useState } from "react";
import { PointRead } from "@/lib/api";
import { bgColorPallet } from "@/modules/data/score/scoreFunctions";
import { DEFAULT_TARGET_TYPE_ID, getTargetType } from "@/modules/data/score/scoreConfig";

interface Props {
  points: Array<PointRead> | null | undefined;
  next: (point: number, x?: number, y?: number) => void;
  nextEnd: () => void;
  back: () => void;
  finish: () => void;
  pointSize: number | null | undefined;
  targetType?: string;
  disabled?: boolean;
}

const padd = 24;
export default function TargetCircleInput(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);
  const [maxRadius, setMaxRadius] = useState<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function updateSize() {
      if (!container) return;
      setWidth(container.clientWidth);
      setHeight(container.clientHeight);
      setMaxRadius(Math.min(container.clientWidth, container.clientHeight) - padd * 2);
    }

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function getTargetCoordinates(event: React.MouseEvent<HTMLButtonElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    const clickX = event.clientX - (rect?.left ?? 0);
    const clickY = event.clientY - (rect?.top ?? 0);

    return {
      relativeX: clickX / width,
      relativeY: clickY / height,
    };
  }

  const handleClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    point: number
  ) => {
    if (props.disabled) return;
    const coordinates = getTargetCoordinates(event);
    props.next(point, coordinates.relativeX, coordinates.relativeY);
  };

  const ringCount = getTargetType(props.targetType ?? DEFAULT_TARGET_TYPE_ID)?.ringCount ?? 11;

  function circleButton(point: number) {
    const color = bgColorPallet(point);

    const radius = (maxRadius / ringCount) * (ringCount + 1 - point);
    const size = radius;

    return (
      <button
        key={point}
        className={`absolute rounded-full ${color} border-1 border-gray-500`}
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

  function getPositionFromRelative(
    relativeX: number | null,
    relativeY: number | null
  ): { x: number | null; y: number | null } {
    if (relativeX === null || relativeY === null) {
      return { x: null, y: null };
    }
    return { x: relativeX * width, y: relativeY * height };
  }

  function createArrow(
    re_x: number | null | undefined,
    re_y: number | null | undefined,
    point: number,
    key: number
  ) {
    if (!re_x || !re_y) return null;

    const { x, y } = getPositionFromRelative(re_x, re_y);
    if (x === null || y === null) {
      return null;
    }
    return (
      <div
        style={{
          left: `${x - 5}px`,
          top: `${y - 5}px`,
          width: "10px",
          height: "10px",
          backgroundColor: "white",
          borderRadius: "50%",
          position: "absolute",
          zIndex: 100,
          border: "2px solid black",
        }}
        key={key}
      />
    );
  }

  return (
    <div className="TargetCircleInput flex h-full w-full flex-col">
      <div ref={containerRef} className="relative min-h-0 flex-1">
        {circles}
        {props.points?.map((point, index) =>
          createArrow(point.x, point.y, point.score, index)
        )}
        <button
          className="absolute inset-0"
          style={{ zIndex: 0 }}
          onClick={(event) => handleClick(event, 0)}
        />
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-3 border-t border-slate-200 p-3">
        <Button variant="outlined" onClick={props.back} disabled={props.disabled}>
          戻る
        </Button>
        <Button variant="outlined" onClick={props.nextEnd} disabled={props.disabled}>
          次へ
        </Button>
        <Button variant="contained" onClick={props.finish} disabled={props.disabled}>
          終了
        </Button>
      </div>
    </div>
  );
}
