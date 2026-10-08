"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/text";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 下の帯に並べる操作(保存・キャンセルなど)。 */
  actions?: ReactNode;
  /** 画面の大部分を使う、幅の広いモーダル(選択肢の多い Picker など)。 */
  wide?: boolean;
};

// 開いているモーダルの重なり順。モーダルの中から別のモーダルを開くので、Escape は一番上のものだけを閉じる
const stack: symbol[] = [];

/** 中央に浮かぶモーダル。背景を押すか Escape で閉じる。親の枠に切られないよう body の直下へ描く。
 * 開くときは親が `{open && <Modal …/>}` のように出し入れする。 */
export default function Modal({ title, onClose, children, actions, wide }: Props) {
  const T = useT();
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const id = Symbol();
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stack[stack.length - 1] === id) close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      stack.splice(stack.indexOf(id), 1);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return createPortal(
    // portal の中のクリックも React の木では親へ伝わるので、背景・中身のどちらでも止める
    <div
      className="modal-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="ghost"
            aria-label={T.close}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
