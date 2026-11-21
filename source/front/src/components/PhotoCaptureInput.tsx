"use client";

import { useRef, useState } from "react";
import ScoreEntryActions from "@/components/ScoreEntryActions";
import type { ScoreInputProps } from "@/components/ScoreEntryShell";
import type { EndPhotoView } from "@/lib/photo/usePhotoQueue";
import { useT } from "@/lib/text";

/**
 * 写真モードの撮影。エンドごとに的の写真を撮って、コメントを書いて次のエンドへ進むだけで、点数は付けない。
 * 撮った写真は端末に置いてから裏で送り(lib/photo/usePhotoQueue.ts)、処理が済めば表示の画像に替わる。
 * 撮り終えたエンドでは「次のエンドを撮る」を主にし、進むのを忘れて前のエンドの写真を撮り直さないようにする
 */
export default function PhotoCaptureInput(props: ScoreInputProps) {
  const T = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const photo = props.photo;
  const view = photo?.view ?? null;
  // 読み終えた画像の URL。印は補正した画像に重ねるので、その画像を読み終えるまで出さない
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  return (
    <div className="PhotoCaptureInput target-input">
      {props.commentBar}
      <div className="photo-capture-area">
        {view ? (
          <figure className="PhotoPreview photo-preview">
            {view.imageUrl && (
              <div className="photo-preview-frame">
                {/* 署名付き URL・端末の写真は next/image の最適化に通せないので、そのまま出す */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  // 画像が替わったら作り直す。ブラウザは src を替えても新しい画像を読み終えるまで前の
                  // 画像(撮った元の写真)を出し続け、その上に補正した画像の印がずれて重なるため
                  key={view.imageUrl}
                  src={view.imageUrl}
                  alt=""
                  onLoad={() => setLoadedUrl(view.imageUrl)}
                />
                {loadedUrl === view.imageUrl && (
                  <EstimateMarks
                    view={view}
                    endSize={props.endSize}
                  />
                )}
              </div>
            )}
            <figcaption className={`PhotoStatus photo-status ${view.status}`}>
              <PhotoStatusText
                view={view}
                endSize={props.endSize}
              />
            </figcaption>
          </figure>
        ) : (
          <p className="PhotoEmpty photo-empty muted">{T.game.entry.photo.noPhoto}</p>
        )}
        {photo?.captureError && (
          <p className="status error">{T.game.entry.photo[photo.captureError]}</p>
        )}
        {photo !== null && photo.pendingCount > 0 && (
          <p className="PhotoPending hint">{T.game.entry.photo.pending(photo.pendingCount)}</p>
        )}
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
            if (file) photo?.capture(file);
          }}
        />
        {view && props.canForwardEnd ? (
          <div className="photo-capture-buttons">
            <button
              type="button"
              className="PhotoCaptureButton large"
              disabled={props.disabled}
              onClick={() => fileInput.current?.click()}
            >
              {T.game.entry.photo.retake}
            </button>
            <button
              type="button"
              className="PhotoNextEndButton primary large"
              disabled={props.disabled}
              onClick={() => {
                // カメラを開くのは押した操作の中でしかできないので、進めてからすぐ開く。撮った写真は
                // 撮り終えたときの位置(進めた先のエンド)に付く
                props.forwardEnd();
                fileInput.current?.click();
              }}
            >
              {T.game.entry.photo.takeNext}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={view ? "PhotoCaptureButton large block" : "PhotoCaptureButton primary large block"}
            disabled={props.disabled}
            onClick={() => fileInput.current?.click()}
          >
            {view ? T.game.entry.photo.retake : T.game.entry.photo.take}
          </button>
        )}
      </div>
      <ScoreEntryActions {...props} />
    </div>
  );
}

/** 推測の印の半径(的に対する割合)。80cm の的で 1.5cm ほど、矢の刺さった穴を隠さない大きさ */
const ESTIMATE_MARK_RADIUS = 0.018;

/**
 * 補正した写真の上に、推測した矢の刺さった点を印で出す。補正で矢として入るもの(確からしい順にエンドの
 * 本数まで)だけを出し、拾えなかった矢があれば撮り直すかをその場で決められるようにする
 */
function EstimateMarks({ view, endSize }: { view: EndPhotoView; endSize: number }) {
  const photo = view.photo;
  if (view.status !== "processed" || !photo?.rectified || photo.display_extent == null) return null;
  const extent = photo.display_extent;
  // 表示の画像は、的に対する割合で -extent から 1 + extent までを写した正方形
  const side = 1 + 2 * extent;
  return (
    <svg
      className="PhotoEstimateMarks photo-estimate-marks"
      viewBox={`${-extent} ${-extent} ${side} ${side}`}
      // img の object-fit: contain と同じく、枠の中に正方形を収めて真ん中に置く
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {photo.estimates.slice(0, endSize).map((arrow, index) => (
        // 写真の明るい所でも暗い所でも見えるよう、黒の縁の上に白の輪を重ねる
        <g
          key={index}
          className="photo-estimate-mark"
        >
          <circle
            cx={arrow.x}
            cy={arrow.y}
            r={ESTIMATE_MARK_RADIUS}
            className="outline"
          />
          <circle
            cx={arrow.x}
            cy={arrow.y}
            r={ESTIMATE_MARK_RADIUS}
          />
        </g>
      ))}
    </svg>
  );
}

export function PhotoStatusText({ view, endSize }: { view: EndPhotoView; endSize: number }) {
  const T = useT();
  const text = T.game.entry.photo;
  switch (view.status) {
    case "saved":
      return <>{text.saved}</>;
    case "uploading":
      return <>{text.uploading}</>;
    case "processing":
      return <>{text.processing}</>;
    case "sendFailed":
      return <>{text.sendFailed}</>;
    case "processFailed":
      return <>{text.processFailed}</>;
    case "failed":
      return <>{view.photo?.error === "too_large" ? text.tooLarge : text.failed}</>;
    case "processed": {
      if (!view.photo?.rectified) return <>{text.noTarget}</>;
      // 補正で矢として入るのはエンドの本数までなので、数もそこで切る
      const count = Math.min(view.photo.estimates.length, endSize);
      return <>{count > 0 ? `${text.processed} · ${text.estimates(count)}` : text.processed}</>;
    }
  }
}
