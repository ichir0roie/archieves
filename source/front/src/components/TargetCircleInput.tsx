"use client";

import { JSX, useEffect, useRef, useState } from "react";
import ArrowSight from "@/components/ArrowSight";
import PhotoAlignment from "@/components/PhotoAlignment";
import PhotoViewer from "@/components/PhotoViewer";
import { photoFileUrl } from "@/lib/api";
import type { Point } from "@/lib/photo/alignment";
import ScoreEntryActions from "@/components/ScoreEntryActions";
import type { ScoreInputProps } from "@/components/ScoreEntryShell";
import { ringClass, scoreAtPosition, scoreToStr, zoneRadiusRatio } from "@/lib/score/scoreFunctions";
import { MISS_SCORE, X_SCORE, arrowDiameterPx, resolveTargetType } from "@/lib/score/scoreConfig";
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

/**
 * エンドが満ちたあと、矢の印をこの距離(px)まで外して押しても、その矢を掴んで動かす。指は印より太いので、
 * 印の大きさでなく指で押せる広さにする
 */
const GRAB_RADIUS_PX = 28;

type Press = {
  pointerId: number;
  /** 押した所(枠の左上からの px)。指の動きはここから測る */
  fingerX: number;
  fingerY: number;
  /** 狙う点の動き始め。新しい矢は押した所、動かす矢はその矢の今の位置 */
  originX: number;
  originY: number;
  /** 狙う点(ズームの中央)。枠の左上からの px */
  x: number;
  y: number;
  /** エンドが満ちたあとに掴んだ矢の番号。新しい矢を入れるときは null */
  moving: number | null;
};

export default function TargetCircleInput(props: ScoreInputProps) {
  const T = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);
  const [height, setHeight] = useState<number>(0);
  const [maxDiameter, setMaxDiameter] = useState<number>(0);
  const [press, setPress] = useState<Press | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState(false);
  const [aligning, setAligning] = useState(false);
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

  // エンドが満ちたら新しい矢は入れず、押した近くの矢を掴んで動かす
  const isLocked = props.isEndFull || props.disabled;
  // 補正のときは、エンドの写真を的に重ねる(補正できた写真)か、隅に小さく出す(まだ補正できない写真)
  const photoView = props.photo?.phase === "review" ? props.photo.view : null;
  const photoUrl = photoView?.imageUrl ?? null;
  const photoExtent = photoView?.photo?.rectified ? photoView.photo.display_extent : null;
  // 処理の済んだ写真なら、元の写真で的を手で合わせ直せる
  const alignable = photoView?.photo?.status === "processed" ? photoView.photo : null;

  /** 手で合わせた 4 点で補正し直す。矢が入っていれば、推測し直した矢で置き換えるかを聞く */
  async function saveAlignment(points: Array<Point>): Promise<boolean> {
    if (!alignable || !props.photo) return false;
    const replace =
      props.points.length === 0 || window.confirm(T.game.entry.photo.replaceConfirm);
    const ok = await props.photo.align(alignable.id, points, replace);
    if (ok) setAligning(false);
    return ok;
  }
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
      x: current.originX + (finger.x - current.fingerX) / aimDivisor,
      y: current.originY + (finger.y - current.fingerY) / aimDivisor,
    };
  }

  /** 枠の px での矢の位置。位置の無い矢は null */
  function markPosition(point: { x: number | null; y: number | null }) {
    if (point.x == null || point.y == null || (point.x === 0 && point.y === 0)) return null;
    return {
      x: centerX + (point.x - 0.5) * maxDiameter,
      y: centerY + (point.y - 0.5) * maxDiameter,
    };
  }

  /**
   * 押した所にいちばん近い、掴める距離の中の矢の番号。無ければ null。
   * 同じ所に重なった矢は、上に描かれている後の矢を掴む
   */
  function nearestPoint(finger: { x: number; y: number }): number | null {
    let nearest: number | null = null;
    let nearestDistance = Math.max(GRAB_RADIUS_PX, arrowPx);
    props.points.forEach((point, index) => {
      const position = markPosition(point);
      if (!position) return;
      const distance = Math.hypot(position.x - finger.x, position.y - finger.y);
      if (distance <= nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    });
    return nearest;
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

  /** 矢の中心が枠の (x, y) px にあるときの点数(scoreAtPosition) */
  function scoreAt(x: number, y: number): number {
    if (maxDiameter === 0) return MISS_SCORE;
    const { relativeX, relativeY } = toTargetCoordinates(x, y);
    return scoreAtPosition(relativeX, relativeY, {
      arrowRatio: arrowPx / maxDiameter,
      allIn: props.allIn,
      innerTen: props.innerTen,
    });
  }

  // 動かしている矢は、狙う点に描く
  const shownPoints = props.points.map((point, index) => {
    if (press?.moving !== index) return point;
    const { relativeX, relativeY } = toTargetCoordinates(press.x, press.y);
    return { ...point, x: relativeX, y: relativeY };
  });

  /*
   * 指で押すと指の下が見えないので、押した所を狙う点の起点にして、的の上の余白にズームを出す。
   * 指を動かすと、狙う点は指の動きの 1/aimDivisor だけ動く。離したときの狙う点を記録する。
   * 帯のボタンは点数の読み上げ・テストで指すために残し、記録そのものは枠が pointer events で受ける。
   */
  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (props.disabled || press) return;
    const finger = fingerPoint(event);
    // 満ちたエンドでは、押した近くの矢を掴む。近くに無ければ何もしない
    const moving = props.isEndFull ? nearestPoint(finger) : null;
    if (props.isEndFull && moving === null) return;
    const origin = moving === null ? finger : markPosition(props.points[moving]) ?? finger;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPress({
      pointerId: event.pointerId,
      fingerX: finger.x,
      fingerY: finger.y,
      originX: origin.x,
      originY: origin.y,
      ...origin,
      moving,
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
    if (props.disabled) return;
    const coordinates = toTargetCoordinates(point.x, point.y);
    const score = scoreAt(point.x, point.y);
    if (press.moving !== null) {
      props.movePoint(press.moving, score, coordinates.relativeX, coordinates.relativeY);
      return;
    }
    if (isLocked) return;
    props.next(score, coordinates.relativeX, coordinates.relativeY);
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
        // 写真を敷いたときは、的の縁(1 点の帯の外)の線だけを見せる(globals.css の .with-photo)
        className={`target-ring ${ringClass(point)} ${point === 1 ? "target-ring-outer" : ""}`}
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

  /** 敷いた写真の大きさと位置(枠の px)。写真は的に対する割合で -extent〜1+extent の正方形 */
  const photoBox =
    photoUrl && photoExtent != null && maxDiameter > 0
      ? {
          size: maxDiameter * (1 + 2 * photoExtent),
          left: centerX - (maxDiameter * (1 + 2 * photoExtent)) / 2,
          top: centerY - (maxDiameter * (1 + 2 * photoExtent)) / 2,
        }
      : null;

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
          {/* 写真を敷いたときは、ズームにも帯でなく写真を拡大して出す(矢の刺さった所を見て狙うため) */}
          {photoUrl && photoBox ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="TargetLensPhoto lens-photo"
              src={photoUrl}
              alt=""
              style={{
                width: `${photoBox.size * lensZoom}px`,
                height: `${photoBox.size * lensZoom}px`,
                left: `${photoBox.left * lensZoom}px`,
                top: `${photoBox.top * lensZoom}px`,
              }}
            />
          ) : (
            lensCircles
          )}
          {shownPoints.map((point, index) => createArrow(point.x, point.y, index, lensZoom))}
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
        className={`TargetFace target-face ${press ? "pressing" : ""} ${photoExtent != null ? "with-photo" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {photoUrl && photoBox && (
          // 補正した写真を、的の帯と重なるように置く。枠の外(下の操作のボタン)には出さない。
          // 枠そのものは切らない(ズームは枠の上にはみ出す)
          <div className="target-photo-clip">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="TargetPhoto target-photo"
              src={photoUrl}
              alt=""
              style={{
                width: `${photoBox.size}px`,
                height: `${photoBox.size}px`,
                left: `${photoBox.left}px`,
                top: `${photoBox.top}px`,
              }}
            />
          </div>
        )}
        {circles}
        {shownPoints.map((point, index) => createArrow(point.x, point.y, index, null))}
        {photoUrl && (
          <button
            type="button"
            className="TargetPhotoThumb target-photo-thumb"
            aria-label={T.game.entry.photo.open}
            // 的の枠が押すのを受けて矢を入れないよう、ここで止める
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setViewingPhoto(true)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt=""
            />
          </button>
        )}
        {alignable && (
          <button
            type="button"
            className="TargetAlignButton target-align-button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setAligning(true)}
          >
            {T.game.entry.photo.align}
          </button>
        )}
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
      {aligning && alignable && (
        <PhotoAlignment
          src={photoFileUrl(alignable.original_url)}
          initial={(alignable.alignment_points as Array<Point> | null) ?? null}
          onSave={saveAlignment}
          onClose={() => setAligning(false)}
        />
      )}
      {viewingPhoto && photoUrl && (
        <PhotoViewer
          src={photoUrl}
          onClose={() => setViewingPhoto(false)}
        />
      )}
    </div>
  );
}
