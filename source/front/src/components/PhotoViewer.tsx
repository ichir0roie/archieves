"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/text";

type Props = {
  src: string;
  onClose: () => void;
};

/**
 * 写真を画面いっぱいに出す。押すと、画面に合わせた大きさと元の画素の大きさを切り替える
 * (元の大きさでは指でずらして見る)。閉じるボタンか Escape で閉じる。
 */
export default function PhotoViewer({ src, onClose }: Props) {
  const T = useT();
  const [actualSize, setActualSize] = useState(false);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return createPortal(
    <div
      className="PhotoViewer photo-viewer"
      role="dialog"
      aria-modal="true"
    >
      <div className={actualSize ? "photo-viewer-scroll actual" : "photo-viewer-scroll"}>
        {/* 署名付き URL は next/image の最適化に通せないので、そのまま出す */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          onClick={() => setActualSize((current) => !current)}
        />
      </div>
      <button
        type="button"
        className="PhotoViewerClose photo-viewer-close"
        onClick={onClose}
      >
        {T.game.entry.photo.close}
      </button>
    </div>,
    document.body,
  );
}
