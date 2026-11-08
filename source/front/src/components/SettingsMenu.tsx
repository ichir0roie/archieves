"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useT } from "@/lib/text";

export type SettingsMenuItem = {
  label: string;
  /** e2e などから指す class */
  className: string;
  onSelect: () => void;
};

/**
 * 画面の右上(PageHeader の actions)に置く設定のボタンと、押すと開く操作の一覧。
 * 削除のような取り返しのつきにくい操作を、画面の流れの中から外してここへまとめる。
 * 選ぶと一覧を閉じてから onSelect を呼ぶ(確かめのモーダルは呼ぶ側が開く)
 */
export default function SettingsMenu({ items }: { items: SettingsMenuItem[] }) {
  const T = useT();
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="PageSettingsOpen page-settings ghost icon"
        onClick={() => setOpen(true)}
        aria-label={T.terms.settings}
        aria-haspopup="dialog"
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          aria-hidden="true"
        >
          <path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle
            cx="12"
            cy="12"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </button>
      {open && (
        <Modal
          title={T.terms.settings}
          onClose={() => setOpen(false)}
        >
          <div className="SettingsMenu stack tight">
            {items.map((item) => (
              <button
                key={item.className}
                type="button"
                className={`${item.className} danger block`}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
