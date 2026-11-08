"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import Modal from "@/components/Modal";
import { toErrorDetails, type ErrorDetails } from "@/lib/api";
import { useT } from "@/lib/text";

type Props = {
  title: string;
  message: string;
  /** 消す。済んだあとの移動・読み直し・閉じるもここで行う。失敗はモーダルの中に出す */
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

/** 削除を確かめるモーダル。送っている間は押させない */
export default function DeleteConfirmModal({ title, message, onConfirm, onClose }: Props) {
  const T = useT();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);

  async function confirm() {
    setSending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(toErrorDetails(e));
      setSending(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
          >
            {T.cancel}
          </button>
          <button
            type="button"
            className="DeleteConfirm danger"
            onClick={confirm}
            disabled={sending}
          >
            {T.delete}
          </button>
        </>
      }
    >
      {error && <ApiErrorAlert error={error} />}
      <p>{message}</p>
    </Modal>
  );
}
