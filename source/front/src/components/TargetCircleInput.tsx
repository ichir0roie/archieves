"use client";

import { JSX, useEffect, useRef, useState } from "react";
import ArrowSight, { LENS_ZOOM } from "@/components/ArrowSight";
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

/** 押しているあいだ指の上に出すズームの直径・指からの間隔(px)。倍率は ArrowSight の LENS_ZOOM */
const LENS_SIZE = 150;
const LENS_GAP = 32;

/**
 * ズームを出す所は、狙う点のこのぶん上。押した直後は狙う点が指の下にあるので、ズームの下端と
 * 指の間が LENS_GAP になる。
 */
const LENS_OFFSET_Y = LENS_GAP + LENS_SIZE / 2;

/** 指の移動に対する、狙う点の移動の割合。細かく狙えるよう、指の動きより小さく動かす */
const AIM_MOVE_RATIO = 0.5;

type Press = {
  pointerId: number;
  /** 押した所(枠の左上からの px)。狙う点はここから動き始める */
  startX: number;
  startY: number;
  /** 狙う点(ズームの中央)。枠の左上からの px */
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

  /** 指の位置を、的の枠の左上からの px にする */
  function fingerPoint(event: React.PointerEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: centerX, y: centerY };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /**
   * 狙う点(ズームの中央)。押した所から、指の動きの AIM_MOVE_RATIO だけ動かす。
   * 枠の外にも出られる(外れを押すため)ので、枠には寄せない。
   */
  function aimPoint(current: Press, event: React.PointerEvent<HTMLDivElement>) {
    const finger = fingerPoint(event);
    return {
      x: current.startX + (finger.x - current.startX) * AIM_MOVE_RATIO,
      y: current.startY + (finger.y - current.startY) * AIM_MOVE_RATIO,
    };
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

  /**
   * 矢の中心が (x, y) のときの点数。矢をゲームで決めた直径(arrowDiameterPx)の円として、縁がいちばん
   * 中心に寄った所で決める。円が少しでも帯の線にかかれば、高い方の帯の点数(線にかかった矢は高い方の得点、
   * というアーチェリーの決まり)。
   * オールインでは逆に、縁がいちばん外に出た所で決める。円が帯に完全に入らなければその帯の点にならず、
   * 線にかかれば低い方、的の縁にかかれば外れ。
   */
  function scoreAt(x: number, y: number): number {
    if (maxDiameter === 0) return MISS_SCORE;
    const distance = Math.hypot(x - centerX, y - centerY);
    const radius = props.arrowDiameterPx / 2;
    const edge = props.allIn ? distance + radius : Math.max(distance - radius, 0);
    return scoreAtDistance(edge / (maxDiameter / 2), ringCount);
  }

  /*
   * 指で押すと指の下が見えないので、押した所を狙う点の起点にして、その上にズームを出す。
   * 指を動かすと、狙う点とズームは指の動きの半分だけ動く。離したときの狙う点を記録する。
   * 帯のボタンは点数の読み上げ・テストで指すために残し、記録そのものは枠が pointer events で受ける。
   */
  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (isLocked || press) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const finger = fingerPoint(event);
    setPress({
      pointerId: event.pointerId,
      startX: finger.x,
      startY: finger.y,
      ...finger,
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!press || press.pointerId !== event.pointerId) return;
    setPress({ ...press, ...aimPoint(press, event) });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!press || press.pointerId !== event.pointerId) return;
    const point = aimPoint(press, event);
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
    const size = props.arrowDiameterPx * zoom;
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

  /**
   * ズームは狙う点の LENS_OFFSET_Y 上に出し、中央に狙う点を拡大して描く。狙う点と一緒に動くので、
   * 枠の中に寄せない
   */
  function lens(current: Press) {
    const left = current.x - LENS_SIZE / 2;
    const top = current.y - LENS_OFFSET_Y - LENS_SIZE / 2;
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
        {/* 十字の円は、ここに置く矢の太さ。円が帯の線にかかれば高い方の点数(オールインなら低い方)になる */}
        <ArrowSight
          arrowDiameterPx={props.arrowDiameterPx}
          ringClassName={ringClass(score)}
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
