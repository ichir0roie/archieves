"use client";

import { useRef } from "react";
import ScoreEntryActions from "@/components/ScoreEntryActions";
import type { ScoreInputProps } from "@/components/ScoreEntryShell";
import type { EndPhotoView } from "@/lib/photo/usePhotoQueue";
import { useT } from "@/lib/text";

/**
 * 写真モードの撮影。エンドごとに的の写真を撮って、コメントを書いて次のエンドへ進むだけで、点数は付けない。
 * 撮った写真は端末に置いてから裏で送り(lib/photo/usePhotoQueue.ts)、処理が済めば表示の画像に替わる。
 */
export default function PhotoCaptureInput(props: ScoreInputProps) {
  const T = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const photo = props.photo;
  const view = photo?.view ?? null;

  return (
    <div className="PhotoCaptureInput target-input">
      {props.commentBar}
      <div className="photo-capture-area">
        {view ? (
          <figure className="PhotoPreview photo-preview">
            {view.imageUrl && (
              // 署名付き URL・端末の写真は next/image の最適化に通せないので、そのまま出す
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={view.imageUrl}
                alt=""
              />
            )}
            <figcaption className={`PhotoStatus photo-status ${view.status}`}>
              <PhotoStatusText view={view} />
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
        <button
          type="button"
          className={view ? "PhotoCaptureButton large block" : "PhotoCaptureButton primary large block"}
          disabled={props.disabled}
          onClick={() => fileInput.current?.click()}
        >
          {view ? T.game.entry.photo.retake : T.game.entry.photo.take}
        </button>
      </div>
      <ScoreEntryActions {...props} />
    </div>
  );
}

export function PhotoStatusText({ view }: { view: EndPhotoView }) {
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
    case "failed":
      return <>{view.photo?.error === "too_large" ? text.tooLarge : text.failed}</>;
    case "processed": {
      const count = view.photo?.estimates.length ?? 0;
      return <>{count > 0 ? `${text.processed} · ${text.estimates(count)}` : text.processed}</>;
    }
  }
}
