"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  averageColor,
  loadSampleImage,
  sampleColor,
  toHex,
  type Rgb,
} from "@/lib/photo/nockColor";
import { useT } from "@/lib/text";

type Props = {
  /** 測った色(#rrggbb)を登録する */
  onSave: (nockColor: string) => void;
  onClose: () => void;
};

type Point = [number, number];
type View = { zoom: number; panX: number; panY: number };
type Sample = { x: number; y: number; color: Rgb };
type Gesture = {
  /** 始めたときの指(frame の座標) */
  start: Map<number, Point>;
  view: View;
  /** 指を動かした(押しただけではない)。押しただけなら色を測る */
  moved: boolean;
};

const FIT_VIEW: View = {
  zoom: 1,
  panX: 0,
  panY: 0,
};
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
/** ボタン・ホイールの一回で変える倍率 */
const ZOOM_STEP = 1.5;
/** これより動かしたら、押したのでなく動かしたとみなす(px) */
const TAP_SLOP_PX = 8;

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** 画面の point を中心に、倍率を zoom にする */
function zoomAround(view: View, zoom: number, [x, y]: Point): View {
  const next = clampZoom(zoom);
  // point の下にある写真の所を、倍率を変えたあとも point の下に置く
  const contentX = (x - view.panX) / view.zoom;
  const contentY = (y - view.panY) / view.zoom;
  return {
    zoom: next,
    panX: x - next * contentX,
    panY: y - next * contentY,
  };
}

/**
 * 矢の色の登録。矢の写真を撮り、拡大してノックを押すと、その色を測る。何本かのノックを押すと、
 * その平均を登録する(日なた・日陰の違いをならす)。測り方は lib/photo/nockColor.ts
 */
export default function NockColorRegistration({ onSave, onClose }: Props) {
  const T = useT();
  const text = T.game.setup.nockRegistration;
  const fileInput = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [image, setImage] = useState<ImageData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [frame, setFrame] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [view, setView] = useState<View>(FIT_VIEW);
  const [samples, setSamples] = useState<Array<Sample>>([]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const update = () => setFrame({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")?.putImageData(image, 0, 0);
  }, [image]);

  // 写真を枠に収めて描く所(倍率 1 のとき。object-fit: contain と同じ計算)
  const rect =
    image && frame.width > 0
      ? (() => {
          const scale = Math.min(frame.width / image.width, frame.height / image.height);
          const width = image.width * scale;
          const height = image.height * scale;
          return {
            left: (frame.width - width) / 2,
            top: (frame.height - height) / 2,
            width,
            height,
          };
        })()
      : null;

  /** 写真の画素の所を、枠の上の所へ */
  function toFrame(x: number, y: number): Point {
    if (!rect || !image) return [0, 0];
    return [
      view.panX + view.zoom * (rect.left + (x * rect.width) / image.width),
      view.panY + view.zoom * (rect.top + (y * rect.height) / image.height),
    ];
  }

  /** 枠の上の所を、写真の画素の所へ */
  function toImage([fx, fy]: Point): Point | null {
    if (!rect || !image) return null;
    const x = (((fx - view.panX) / view.zoom - rect.left) * image.width) / rect.width;
    const y = (((fy - view.panY) / view.zoom - rect.top) * image.height) / rect.height;
    return x < 0 || y < 0 || x >= image.width || y >= image.height ? null : [x, y];
  }

  async function pick(file: File) {
    setLoadFailed(false);
    try {
      setImage(await loadSampleImage(file));
      setView(FIT_VIEW);
      setSamples([]);
    } catch {
      setLoadFailed(true);
    }
  }

  function fingerPoint(event: React.PointerEvent<HTMLDivElement>): Point {
    const box = frameRef.current?.getBoundingClientRect();
    return box ? [event.clientX - box.left, event.clientY - box.top] : [0, 0];
  }

  /** 今の指(gesture.start と同じ id の、動いたあとの所) */
  const current = useRef(new Map<number, Point>());

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!image) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    current.current.set(event.pointerId, fingerPoint(event));
    // 指が増えたら、その時点から測り直す(1 本で動かす → 2 本で拡大)
    gesture.current = {
      start: new Map(current.current),
      view,
      moved: (gesture.current?.moved ?? false) || current.current.size > 1,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || !current.current.has(event.pointerId)) return;
    current.current.set(event.pointerId, fingerPoint(event));
    const ids = [...active.start.keys()].filter((id) => current.current.has(id));
    if (ids.length >= 2) {
      const [a, b] = ids;
      const [a0, b0] = [active.start.get(a)!, active.start.get(b)!];
      const [a1, b1] = [current.current.get(a)!, current.current.get(b)!];
      const distance0 = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]);
      const distance1 = Math.hypot(a1[0] - b1[0], a1[1] - b1[1]);
      const middle0: Point = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
      const middle1: Point = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
      const zoomed = zoomAround(active.view, active.view.zoom * (distance1 / Math.max(1, distance0)), middle0);
      setView({
        ...zoomed,
        panX: zoomed.panX + middle1[0] - middle0[0],
        panY: zoomed.panY + middle1[1] - middle0[1],
      });
      active.moved = true;
      return;
    }
    const start = active.start.get(event.pointerId);
    const now = current.current.get(event.pointerId);
    if (!start || !now) return;
    const dx = now[0] - start[0];
    const dy = now[1] - start[1];
    if (!active.moved && Math.hypot(dx, dy) < TAP_SLOP_PX) return;
    active.moved = true;
    setView({ ...active.view, panX: active.view.panX + dx, panY: active.view.panY + dy });
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    const point = current.current.get(event.pointerId);
    current.current.delete(event.pointerId);
    if (!active) return;
    if (current.current.size > 0) {
      // 残った指で続けて動かせるよう、そこから測り直す
      gesture.current = {
        start: new Map(current.current),
        view,
        moved: true,
      };
      return;
    }
    gesture.current = null;
    if (active.moved || !point || !image || event.type === "pointercancel") return;
    const at = toImage(point);
    const color = at ? sampleColor(image, at[0], at[1]) : null;
    if (at && color) {
      setSamples((list) => [
        ...list,
        {
          x: at[0],
          y: at[1],
          color,
        },
      ]);
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!image) return;
    const box = frameRef.current?.getBoundingClientRect();
    if (!box) return;
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    setView((v) => zoomAround(v, v.zoom * factor, [event.clientX - box.left, event.clientY - box.top]));
  }

  function zoomBy(factor: number) {
    setView((v) => zoomAround(v, v.zoom * factor, [frame.width / 2, frame.height / 2]));
  }

  const registered = samples.length > 0 ? toHex(averageColor(samples.map((s) => s.color))) : null;

  return createPortal(
    <div
      className="NockColorRegistration photo-alignment nock-registration"
      role="dialog"
      aria-modal="true"
      aria-label={text.title}
    >
      <div className="photo-alignment-head">
        <p className="photo-alignment-hint">{image ? text.pickHint : text.takeHint}</p>
        {loadFailed && <p className="status error">{text.loadFailed}</p>}
      </div>
      <div
        ref={frameRef}
        className="NockColorFrame photo-alignment-frame"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={handleWheel}
      >
        {image && rect ? (
          <>
            <div
              className="nock-registration-layer"
              style={{
                transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
              }}
            >
              <canvas
                ref={canvasRef}
                className="nock-registration-image"
                style={{
                  left: `${rect.left}px`,
                  top: `${rect.top}px`,
                  width: `${rect.width}px`,
                  height: `${rect.height}px`,
                }}
              />
            </div>
            <svg
              className="photo-alignment-overlay"
              width={frame.width}
              height={frame.height}
              aria-hidden="true"
            >
              {samples.map((sample, index) => {
                const [sx, sy] = toFrame(sample.x, sample.y);
                return (
                  <g key={index}>
                    <circle
                      cx={sx}
                      cy={sy}
                      r={9}
                      className="nock-sample-mark"
                      style={{ fill: toHex(sample.color) }}
                    />
                    <text
                      x={sx}
                      y={sy - 14}
                      className="alignment-handle-label"
                    >
                      {index + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
          </>
        ) : (
          // 最初にすることなので、写真を撮るまでは枠の真ん中に大きく出す
          <div className="nock-registration-start">
            <button
              type="button"
              className="NockColorTake primary large"
              onClick={() => fileInput.current?.click()}
            >
              {text.take}
            </button>
          </div>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // 同じ写真を選び直しても change が来るよう、選んだものを外しておく
          event.target.value = "";
          if (file) void pick(file);
        }}
      />
      {image && (
        <div className="nock-registration-tools">
          <button
            type="button"
            className="NockColorRetake"
            onClick={() => fileInput.current?.click()}
          >
            {text.retake}
          </button>
          <div
            className="nock-registration-zoom"
            role="group"
            aria-label={text.zoom}
          >
            <button
              type="button"
              aria-label={text.zoomOut}
              onClick={() => zoomBy(1 / ZOOM_STEP)}
              disabled={view.zoom <= MIN_ZOOM}
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setView(FIT_VIEW)}
            >
              {text.zoomFit}
            </button>
            <button
              type="button"
              aria-label={text.zoomIn}
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={view.zoom >= MAX_ZOOM}
            >
              +
            </button>
          </div>
        </div>
      )}
      {/* 押した所が増えても写真の枠の大きさが変わらない(押した写真が指の下から動かない)よう、
          写真を撮ったら一覧の場所を同じ高さで取っておく */}
      {image && (
        <div className="NockSamples nock-registration-samples">
          {samples.length === 0 && <p className="nock-registration-empty">{text.noSamples}</p>}
          <ul
            className="nock-sample-list"
            aria-label={text.samples}
          >
            {samples.map((sample, index) => (
              <li key={index}>
                <button
                  type="button"
                  className="NockSample nock-sample"
                  aria-label={text.removeSample(index + 1)}
                  onClick={() => setSamples((list) => list.filter((_, i) => i !== index))}
                >
                  <span
                    className="nock-swatch"
                    style={{ background: toHex(sample.color) }}
                  />
                  {index + 1} ×
                </button>
              </li>
            ))}
          </ul>
          {registered && (
            <p className="NockColorResult nock-registration-result">
              <span
                className="nock-swatch large"
                style={{ background: registered }}
              />
              {text.result(samples.length)}
            </p>
          )}
        </div>
      )}
      <div className="photo-alignment-actions">
        <button
          type="button"
          className="NockColorCancel"
          onClick={onClose}
        >
          {text.cancel}
        </button>
        <button
          type="button"
          className="NockColorSave primary"
          disabled={registered === null}
          onClick={() => registered && onSave(registered)}
        >
          {text.save}
        </button>
      </div>
    </div>,
    document.body,
  );
}
