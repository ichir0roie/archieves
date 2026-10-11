"use client";

import { JSX, useEffect, useRef, useState } from "react";
import ScoreEntryActions from "@/components/ScoreEntryActions";
import type { ScoreInputProps } from "@/components/ScoreEntryShell";
import { ringClass, scoreToStr, zoneRadiusRatio } from "@/lib/score/scoreFunctions";
import {
  MAX_RING_SCORE,
  MISS_SCORE,
  X_SCORE,
  resolveTargetType,
} from "@/lib/score/scoreConfig";
import { useT } from "@/lib/text";

/**
 * 的の周りの余白(px)。下だけ広く取るのは、的の下に外した矢を押しやすくするため。
 * 的の下端から枠の下端までが外れの押せる領域になる。
 */
const PADDING = 24;
const PADDING_BOTTOM = 72;

/** 押しているあいだ指の上に出すズームの直径・倍率・指からの間隔(px) */
const LENS_SIZE = 150;
const LENS_ZOOM = 2.5;
const LENS_GAP = 32;

/**
 * 狙う点(ズームの中央)は、指のこのぶん上。ズームを指の上に出すので、ズームの下端と指の間が
 * LENS_GAP になる所がちょうどズームの中心にあたる。
 */
const AIM_OFFSET_Y = LENS_GAP + LENS_SIZE / 2;

/**
 * 的に描く矢の印の直径(px)。点数は、矢をこの太さの円として決める。印が少しでも帯の線に
 * かかっていれば、高い方の帯の点数にする(線にかかった矢は高い方の得点、というアーチェリーの決まり)。
 * 本物の矢の太さ(5mm ほど)を画面に縮めると 1px ほどで見えないので、目に見える印の大きさに合わせる。
 */
const ARROW_MARK_SIZE = 10;

type Press = {
  pointerId: number;
  x: number;
  y: number;
};

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(Math.max(value, 0), 1);
}

/** 中心からの距離(的の半径に対する割合)が入る帯の点数。線の上は内側(高い方)。的の外は外れ */
function scoreAtDistance(distanceRatio: number, ringCount: number): number {
  for (let score = ringCount; score >= 1; score--) {
    if (distanceRatio <= zoneRadiusRatio(score)) return score;
  }
  return MISS_SCORE;
}

export default function TargetCircleInput(props: ScoreInputProps) {
  const T = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);
  const [maxDiameter, setMaxDiameter] = useState<number>(0);
  const [press, setPress] = useState<Press | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function updateSize() {
      if (!container) return;
      setWidth(container.clientWidth);
      setHeight(container.clientHeight);
      setMaxDiameter(
        Math.max(
          Math.min(
            container.clientWidth - PADDING * 2,
            container.clientHeight - PADDING - PADDING_BOTTOM
          ),
          0
        )
      );
    }

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /** 的の中心。下の余白が広いぶん、枠の中央より上に寄る */
  const centerX = width / 2;
  const centerY = (height - PADDING_BOTTOM + PADDING) / 2;

  const isLocked = props.isEndFull || props.disabled;
  const { ringCount } = resolveTargetType(props.targetType);

  /**
   * 狙う点(ズームの中央)を、的の枠の左上からの px にする。押した所でなく、指の上の
   * AIM_OFFSET_Y だけ上。枠の外にも出られる(外れを押すため)ので、枠には寄せない。
   */
  function aimPoint(event: React.PointerEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: centerX, y: centerY };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top - AIM_OFFSET_Y };
  }

  /**
   * 枠の中の位置を、的そのものに対する割合で返す(0.5/0.5 が中心、0 と 1 が縁)。
   * API は中心からのずれに的の実寸を掛けて x_cm/y_cm にするので、縦横比の違う入力の枠でなく
   * 的に対する割合でなければならない。的の外を押したときは縁に寄せる。
   */
  function toTargetCoordinates(x: number, y: number) {
    if (maxDiameter === 0) return { relativeX: 0.5, relativeY: 0.5 };
    return {
      relativeX: clampFraction(0.5 + (x - centerX) / maxDiameter),
      relativeY: clampFraction(0.5 + (y - centerY) / maxDiameter),
    };
  }

  /** 矢の中心が (x, y) のときの点数。矢の縁がいちばん中心に寄った所で決める(線にかかれば高い方) */
  function scoreAt(x: number, y: number): number {
    if (maxDiameter === 0) return MISS_SCORE;
    const nearestEdge = Math.max(Math.hypot(x - centerX, y - centerY) - ARROW_MARK_SIZE / 2, 0);
    return scoreAtDistance(nearestEdge / (maxDiameter / 2), ringCount);
  }

  /*
   * 指で押すと指の下が見えないので、押した所で決めずに、指の上にズームを出し、その中央の
   * 位置を狙う点にする。離したときの狙う点を記録する。帯のボタンは点数の読み上げ・テストで
   * 指すために残し、記録そのものは枠が pointer events で受ける。
   */
  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (isLocked || press) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPress({ pointerId: event.pointerId, ...aimPoint(event) });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!press || press.pointerId !== event.pointerId) return;
    setPress({ pointerId: event.pointerId, ...aimPoint(event) });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!press || press.pointerId !== event.pointerId) return;
    const point = aimPoint(event);
    setPress(null);
    if (isLocked) return;
    const coordinates = toTargetCoordinates(point.x, point.y);
    props.next(scoreAt(point.x, point.y), coordinates.relativeX, coordinates.relativeY);
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    if (!press || press.pointerId !== event.pointerId) return;
    setPress(null);
  }

  // 帯は高い点ほど内側で、外の帯より上に重ねる。押した所を覆ういちばん小さい帯に当たるように
  function circleButton(point: number) {
    const size = maxDiameter * zoneRadiusRatio(point);

    return (
      <button
        key={point}
        type="button"
        tabIndex={-1}
        aria-label={T.game.entry.ringLabel(point)}
        disabled={isLocked}
        className={`target-ring ${ringClass(point)}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `calc(${centerX}px - ${size / 2}px)`,
          top: `calc(${centerY}px - ${size / 2}px)`,
          zIndex: point,
        }}
      />
    );
  }

  /** ズームの中に描く帯。ボタンでなく、倍率を掛けた位置に置くだけ */
  function lensRing(point: number) {
    const size = maxDiameter * zoneRadiusRatio(point) * LENS_ZOOM;
    return (
      <div
        key={point}
        className={`target-ring ${ringClass(point)}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `${centerX * LENS_ZOOM - size / 2}px`,
          top: `${centerY * LENS_ZOOM - size / 2}px`,
          zIndex: point,
        }}
      />
    );
  }

  const circles = new Array<JSX.Element>();
  const lensCircles = new Array<JSX.Element>();
  for (let i = 1; i <= ringCount; i++) {
    circles.push(circleButton(i));
    lensCircles.push(lensRing(i));
  }

  /**
   * (0, 0) は位置の無い矢(かつて点数だけを入力した記録)の値なので、描く位置が無い。
   * 印はすべての帯より上にあるので、押されても受けないようにする(.arrow-mark の pointer-events: none)。
   * でないと同じ所への二本目が的でなく一本目の印に当たる。
   */
  function createArrow(
    relativeX: number | null | undefined,
    relativeY: number | null | undefined,
    key: number,
    zoom: number
  ) {
    if (relativeX == null || relativeY == null) return null;
    if (relativeX === 0 && relativeY === 0) return null;

    // ズームの中でも矢の太さを同じ倍率で描き、帯の線とのかかり具合が見えるようにする
    const size = ARROW_MARK_SIZE * zoom;
    return (
      <div
        key={key}
        className="arrow-mark"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `${(centerX + (relativeX - 0.5) * maxDiameter) * zoom - size / 2}px`,
          top: `${(centerY + (relativeY - 0.5) * maxDiameter) * zoom - size / 2}px`,
        }}
      />
    );
  }

  /** ズームは狙う点を中心に出す。中央が記録する位置そのものなので、枠の中に寄せない */
  function lens(current: Press) {
    const left = current.x - LENS_SIZE / 2;
    const top = current.y - LENS_SIZE / 2;
    const score = scoreAt(current.x, current.y);

    return (
      <div
        className="TargetLens target-lens"
        style={{ width: `${LENS_SIZE}px`, height: `${LENS_SIZE}px`, left: `${left}px`, top: `${top}px` }}
      >
        <div
          className="lens-content"
          style={{
            left: `calc(50% - ${current.x * LENS_ZOOM}px)`,
            top: `calc(50% - ${current.y * LENS_ZOOM}px)`,
            width: `${width * LENS_ZOOM}px`,
            height: `${height * LENS_ZOOM}px`,
          }}
        >
          {lensCircles}
          {props.points.map((point, index) => createArrow(point.x, point.y, index, LENS_ZOOM))}
        </div>
        {/* 中央の帯と同じ色だと埋もれるので、帯のクラスを付けて反転色で描く(globals.css) */}
        {/* 十字の円は、ここに置く矢の太さ。円が帯の線にかかれば高い方の点数になる */}
        <div
          className={`lens-crosshair ${ringClass(score)}`}
          style={{ "--arrow-size": `${ARROW_MARK_SIZE * LENS_ZOOM}px` } as React.CSSProperties}
        />
        <div className={`lens-score ${ringClass(score)}`}>{scoreToStr(score)}</div>
      </div>
    );
  }

  return (
    <div className="TargetCircleInput target-input">
      {props.commentBar}
      <div
        ref={containerRef}
        className={`TargetFace target-face ${press ? "pressing" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {circles}
        {props.points.map((point, index) => createArrow(point.x, point.y, index, 1))}
        <button
          type="button"
          tabIndex={-1}
          aria-label={T.game.entry.miss}
          disabled={isLocked}
          className="miss-area"
        />
        {press && lens(press)}
      </div>
      <ScoreEntryActions {...props} />
    </div>
  );
}
