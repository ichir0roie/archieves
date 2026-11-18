"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { zoneRadiusRatio } from "@/lib/score/scoreFunctions";
import { X_SCORE } from "@/lib/score/scoreConfig";
import {
  ALIGNMENT_TARGET_POINTS,
  applyHomography,
  defaultAlignment,
  isUsableAlignment,
  solveHomography,
  type Point,
} from "@/lib/photo/alignment";
import { useT } from "@/lib/text";

type Props = {
  /** 元の写真 */
  src: string;
  /** 最初の 4 点(元の写真の幅・高さに対する割合)。無ければ写真の中央に置く */
  initial: Array<Point> | null;
  /** 4 点で補正し直す。できなければ false(画面に残って、もう一度押せる) */
  onSave: (points: Array<Point>) => Promise<boolean>;
  onClose: () => void;
};

/** 指の動きに対する点の動き。指で隠れる小さな線に合わせるので、指より小さく動かす */
const DRAG_RATIO = 0.5;
/** 点を掴める、指からの距離(px) */
const GRAB_PX = 44;
/** 動かしている点の周りを出す拡大鏡の倍率と大きさ(px) */
const LENS_ZOOM = 3;
const LENS_PX = 140;
/** 輪を描くときの、円の分け方 */
const RING_STEPS = 96;

type Rect = { left: number; top: number; width: number; height: number };

type Drag = {
  pointerId: number;
  index: number;
  fingerX: number;
  fingerY: number;
  start: Point;
};

/**
 * 写真の的を手で合わせる。元の写真の上に、青の帯の外の線の上・右・下・左の 4 点を置き、
 * 4 点から求めた的の輪を重ねて描く。輪が印刷の線に重なるまで点を動かして、保存すると補正し直す。
 */
export default function PhotoAlignment({ src, initial, onSave, onClose }: Props) {
  const T = useT();
  const text = T.game.entry.photo;
  const frameRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [frame, setFrame] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [points, setPoints] = useState<Array<Point> | null>(initial);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const update = () => setFrame({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 写真を枠に収めて描く所(object-fit: contain と同じ計算)
  const rect: Rect | null =
    natural && frame.width > 0
      ? (() => {
          const scale = Math.min(frame.width / natural.width, frame.height / natural.height);
          const width = natural.width * scale;
          const height = natural.height * scale;
          return {
            left: (frame.width - width) / 2,
            top: (frame.height - height) / 2,
            width,
            height,
          };
        })()
      : null;

  const toScreen = ([x, y]: Point): Point =>
    rect ? [rect.left + x * rect.width, rect.top + y * rect.height] : [0, 0];

  const usable = points !== null && isUsableAlignment(points);
  const homography = usable && points ? solveHomography(ALIGNMENT_TARGET_POINTS, points) : null;

  /** 的の割合で半径 r の円を、写真の上の折れ線にする */
  function ringPath(radius: number): string {
    if (!homography) return "";
    const parts: Array<string> = [];
    for (let i = 0; i <= RING_STEPS; i++) {
      const angle = (i / RING_STEPS) * Math.PI * 2;
      const point = applyHomography(homography, [
        0.5 + radius * Math.cos(angle),
        0.5 + radius * Math.sin(angle),
      ]);
      const [sx, sy] = toScreen(point);
      parts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(1)},${sy.toFixed(1)}`);
    }
    return parts.join(" ");
  }

  function fingerPoint(event: React.PointerEvent<HTMLDivElement>): Point {
    const box = frameRef.current?.getBoundingClientRect();
    return box ? [event.clientX - box.left, event.clientY - box.top] : [0, 0];
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!points || !rect || drag || saving) return;
    const [fx, fy] = fingerPoint(event);
    let nearest = -1;
    let nearestDistance = GRAB_PX;
    for (let index = 0; index < points.length; index++) {
      const [sx, sy] = toScreen(points[index]);
      const distance = Math.hypot(sx - fx, sy - fy);
      if (distance <= nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    }
    if (nearest < 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ pointerId: event.pointerId, index: nearest, fingerX: fx, fingerY: fy, start: points[nearest] });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId || !rect || !points) return;
    const [fx, fy] = fingerPoint(event);
    const moved: Point = [
      drag.start[0] + ((fx - drag.fingerX) * DRAG_RATIO) / rect.width,
      drag.start[1] + ((fy - drag.fingerY) * DRAG_RATIO) / rect.height,
    ];
    setPoints(points.map((point, index) => (index === drag.index ? moved : point)));
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (drag && drag.pointerId === event.pointerId) setDrag(null);
  }

  async function save() {
    if (!points || !usable || saving) return;
    setSaving(true);
    setFailed(false);
    const ok = await onSave(points);
    setSaving(false);
    if (!ok) setFailed(true);
  }

  const active = drag && points ? toScreen(points[drag.index]) : null;

  return createPortal(
    <div
      className="PhotoAlignment photo-alignment"
      role="dialog"
      aria-modal="true"
      aria-label={text.alignTitle}
    >
      <div className="photo-alignment-head">
        <p className="photo-alignment-hint">{text.alignHint}</p>
        {points && !usable && <p className="AlignmentInvalid status error">{text.alignInvalid}</p>}
        {failed && <p className="status error">{text.alignFailed}</p>}
      </div>
      <div
        ref={frameRef}
        className="PhotoAlignmentFrame photo-alignment-frame"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        {/* 署名付き URL は next/image の最適化に通せないので、そのまま出す */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="photo-alignment-image"
          onLoad={(event) => {
            const image = event.currentTarget;
            setNatural({ width: image.naturalWidth, height: image.naturalHeight });
            setPoints((current) => current ?? defaultAlignment(image.naturalWidth, image.naturalHeight));
          }}
        />
        {rect && points && (
          <svg
            className="photo-alignment-overlay"
            width={frame.width}
            height={frame.height}
            aria-hidden="true"
          >
            {Array.from({ length: X_SCORE }, (_, i) => i + 1).map((score) => (
              <path
                key={score}
                d={ringPath(zoneRadiusRatio(score) / 2)}
                className={score === 5 ? "alignment-ring main" : "alignment-ring"}
              />
            ))}
            {points.map((point, index) => {
              const [sx, sy] = toScreen(point);
              return (
                <g key={index}>
                  <circle
                    cx={sx}
                    cy={sy}
                    r={drag?.index === index ? 7 : 10}
                    className="alignment-handle"
                  />
                  <text
                    x={sx}
                    y={sy - 16}
                    className="alignment-handle-label"
                  >
                    {text.alignHandles[index]}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
        {rect && active && (
          // 動かしている点の周りを、指に隠れない上の方に拡大して出す
          <div
            className="photo-alignment-lens"
            style={{
              width: `${LENS_PX}px`,
              height: `${LENS_PX}px`,
              backgroundImage: `url("${src}")`,
              backgroundSize: `${rect.width * LENS_ZOOM}px ${rect.height * LENS_ZOOM}px`,
              backgroundPosition: `${LENS_PX / 2 - (active[0] - rect.left) * LENS_ZOOM}px ${
                LENS_PX / 2 - (active[1] - rect.top) * LENS_ZOOM
              }px`,
            }}
          />
        )}
      </div>
      <div className="photo-alignment-actions">
        <button
          type="button"
          className="PhotoAlignmentCancel"
          onClick={onClose}
          disabled={saving}
        >
          {text.alignCancel}
        </button>
        <button
          type="button"
          className="PhotoAlignmentSave primary"
          onClick={() => void save()}
          disabled={!usable || saving}
        >
          {saving ? text.alignSaving : text.alignSave}
        </button>
      </div>
    </div>,
    document.body,
  );
}
