"use client";

import { JSX, useEffect, useRef, useState } from "react";
import ArrowSight from "@/components/ArrowSight";
import ScoreEntryActions from "@/components/ScoreEntryActions";
import type { ScoreInputProps } from "@/components/ScoreEntryShell";
import { ringClass, scoreToStr, zoneRadiusRatio } from "@/lib/score/scoreFunctions";
import {
  MAX_RING_SCORE,
  MISS_SCORE,
  X_SCORE,
  arrowDiameterPx,
  resolveTargetType,
} from "@/lib/score/scoreConfig";
import { saveTargetDiameterPx } from "@/lib/storage";
import { useT } from "@/lib/text";

/**
 * 的の周りの余白(px)。的は枠の下に寄せる(横は中央)。外れは、余白を押すか、押したまま的の外へ狙う点を動かして入れる。
 * 設定画面も、記入画面を開く前の的の大きさの見積もりに使う
 */
export const TARGET_FACE_PADDING = 24;

/**
 * 的の上に描く矢の印の、最小の直径(px)。既定の矢(5mm)は実寸で 1〜2px で見えないので、
 * 印だけこれより小さくしない。点数は実寸の円で決める(scoreAt)。
 * ズームの中には当てない。サイトの円(実寸を倍率で描く)と大きさが揃わなくなるため
 */
const MIN_ARROW_MARK_PX = 8;

type Press = {
  pointerId: number;
  /** 押した所(枠の左上からの px)。狙う点はここから動き始める */
  startX: number;
  startY: number;
  /** 狙う点(ズームの中央)。枠の左上からの px */
  x: number;
  y: number;
};

/** 中心からの距離(的の半径に対する割合)が入る帯の点数。線の上は内側(高い方)。的の外は外れ */
function scoreAtDistance(distanceRatio: number): number {
  for (let score = X_SCORE; score >= 1; score--) {
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
  const { lensZoom, aimDivisor, lensSizePercent, alwaysShowSight } = props.aimSettings;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function updateSize() {
      if (!container) return;
      const diameter = Math.max(
        Math.min(
          container.clientWidth - TARGET_FACE_PADDING * 2,
          container.clientHeight - TARGET_FACE_PADDING * 2
        ),
        0
      );
      setWidth(container.clientWidth);
      setHeight(container.clientHeight);
      setMaxDiameter(diameter);
      // 設定画面のサイトの見本を、この端末の記入画面と同じ大きさで描くため
      saveTargetDiameterPx(diameter);
    }

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // 的は枠の下に寄せる。上に空いた所へズームを出す
  const centerX = width / 2;
  const centerY = height - TARGET_FACE_PADDING - maxDiameter / 2;
  const targetTop = centerY - maxDiameter / 2;

  const isLocked = props.isEndFull || props.disabled;
  const { sizeCm } = resolveTargetType(props.targetType);
  const arrowPx = arrowDiameterPx(props.arrowDiameterMm, sizeCm, maxDiameter);

  /** 指の位置を、的の枠の左上からの px にする */
  function fingerPoint(event: React.PointerEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: centerX, y: centerY };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /**
   * 狙う点(ズームの中央)。押した所から、指の動きの 1/aimDivisor だけ動かす。細かく狙えるよう、
   * 指の動きより小さく動かす。
   * 枠の外にも出られる(外れを押すため)ので、枠には寄せない。
   */
  function aimPoint(current: Press, event: React.PointerEvent<HTMLDivElement>) {
    const finger = fingerPoint(event);
    return {
      x: current.startX + (finger.x - current.startX) / aimDivisor,
      y: current.startY + (finger.y - current.startY) / aimDivisor,
    };
  }

  /**
   * 枠の中の位置を、的そのものに対する割合で返す(0.5/0.5 が中心、0 と 1 が縁)。
   * API は中心からのずれに的の実寸を掛けて x_cm/y_cm にするので、縦横比の違う入力の枠でなく
   * 的に対する割合でなければならない。的の外を狙ったときは縁に寄せず、0〜1 の外の値のまま返す。
   */
  function toTargetCoordinates(x: number, y: number) {
    if (maxDiameter === 0) return { relativeX: 0.5, relativeY: 0.5 };
    return {
      relativeX: 0.5 + (x - centerX) / maxDiameter,
      relativeY: 0.5 + (y - centerY) / maxDiameter,
    };
  }

  /**
   * 矢の中心が (x, y) のときの点数。矢をゲームで決めた直径(arrowPx)の円として、縁がいちばん
   * 中心に寄った所で決める。円が少しでも帯の線にかかれば、高い方の帯の点数(線にかかった矢は高い方の得点、
   * というアーチェリーの決まり)。
   * インサイドアウトでは逆に、縁がいちばん外に出た所で決める。円が帯に完全に入らなければその帯の点にならず、
   * 線にかかれば低い方、的の縁にかかれば外れ。
   * インナー10(コンパウンド)では、X の外の 10 点の帯を 9 点にする。X の輪は X のまま
   */
  function scoreAt(x: number, y: number): number {
    if (maxDiameter === 0) return MISS_SCORE;
    const distance = Math.hypot(x - centerX, y - centerY);
    const radius = arrowPx / 2;
    const edge = props.allIn ? distance + radius : Math.max(distance - radius, 0);
    const score = scoreAtDistance(edge / (maxDiameter / 2));
    return props.innerTen && score === MAX_RING_SCORE ? MAX_RING_SCORE - 1 : score;
  }

  /*
   * 指で押すと指の下が見えないので、押した所を狙う点の起点にして、的の上の余白にズームを出す。
   * 指を動かすと、狙う点は指の動きの 1/aimDivisor だけ動く。離したときの狙う点を記録する。
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
    const size = maxDiameter * zoneRadiusRatio(point) * lensZoom;
    return (
      <div
        key={point}
        className={`target-ring ${ringClass(point)}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `${centerX * lensZoom - size / 2}px`,
          top: `${centerY * lensZoom - size / 2}px`,
          zIndex: point,
        }}
      />
    );
  }

  const circles = new Array<JSX.Element>();
  const lensCircles = new Array<JSX.Element>();
  for (let i = 1; i <= X_SCORE; i++) {
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
    /** ズームの中に描くときの倍率。的の上に描くときは null */
    lensZoomOrNull: number | null
  ) {
    if (relativeX == null || relativeY == null) return null;
    if (relativeX === 0 && relativeY === 0) return null;

    // ズームの中では矢の太さをサイトと同じ倍率の実寸で描き、帯の線とのかかり具合が見えるようにする
    const zoom = lensZoomOrNull ?? 1;
    const size = lensZoomOrNull === null ? Math.max(arrowPx, MIN_ARROW_MARK_PX) : arrowPx * zoom;
    // 中心は translate(-50%, -50%)(globals.css の .arrow-mark)で合わせる。size / 2 を引くと、
    // 枠線より小さい印は枠線のぶん大きく描かれて中心がずれる
    return (
      <div
        key={key}
        className="arrow-mark"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `${(centerX + (relativeX - 0.5) * maxDiameter) * zoom}px`,
          top: `${(centerY + (relativeY - 0.5) * maxDiameter) * zoom}px`,
        }}
      />
    );
  }

  /**
   * ズームは的の上の余白の中央に置いたまま動かさず、中央に狙う点を拡大して描く。
   * 見る所をいつも同じにして、慣れれば目を動かさずに狙えるようにするため、指には付いていかない。
   * 余白がズームより狭いときは、枠の上の行と的に上下ともはみ出す。直径は記入画面の横幅の lensSizePercent %。
   * 設定(alwaysShowSight)で、押していないあいだも見る所が分かるよう、ズームの中央の位置にサイトだけを出しておける
   */
  function lens(current: Press | null) {
    const lensSize = (width * lensSizePercent) / 100;
    const left = centerX - lensSize / 2;
    const top = targetTop / 2 - lensSize / 2;
    const style = { width: `${lensSize}px`, height: `${lensSize}px`, left: `${left}px`, top: `${top}px` };

    if (!current) {
      if (!alwaysShowSight) return null;
      return (
        <div
          className="TargetLensIdle target-lens-idle"
          style={style}
        >
          {/* 帯のクラスを付けず、画面の地の色の反転色で描く(globals.css の .target-lens-idle) */}
          <ArrowSight
            arrowDiameterPx={arrowPx}
            zoom={lensZoom}
            ringClassName=""
          />
        </div>
      );
    }

    const score = scoreAt(current.x, current.y);
    return (
      <div
        className="TargetLens target-lens"
        style={style}
      >
        <div
          className="lens-content"
          style={{
            left: `calc(50% - ${current.x * lensZoom}px)`,
            top: `calc(50% - ${current.y * lensZoom}px)`,
            width: `${width * lensZoom}px`,
            height: `${height * lensZoom}px`,
          }}
        >
          {lensCircles}
          {props.points.map((point, index) => createArrow(point.x, point.y, index, lensZoom))}
        </div>
        {/* 中央の帯と同じ色だと埋もれるので、帯のクラスを付けて反転色で描く(globals.css) */}
        {/* 十字の円は、ここに置く矢の太さ。円が帯の線にかかれば高い方の点数(インサイドアウトなら低い方)になる */}
        <ArrowSight
          arrowDiameterPx={arrowPx}
          zoom={lensZoom}
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
        {props.points.map((point, index) => createArrow(point.x, point.y, index, null))}
        <button
          type="button"
          tabIndex={-1}
          aria-label={T.game.entry.miss}
          disabled={isLocked}
          className="miss-area"
        />
        {maxDiameter > 0 && lens(press)}
      </div>
      <ScoreEntryActions {...props} />
    </div>
  );
}
