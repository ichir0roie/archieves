"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import MatchInfoFields from "@/components/MatchInfoFields";
import Modal from "@/components/Modal";
import { toErrorDetails, type ErrorDetails } from "@/lib/api";
import type { MatchInfo } from "@/lib/score/match";
import { useT } from "@/lib/text";

type Props = {
  title: string;
  submitLabel: string;
  initial?: MatchInfo;
  onClose: () => void;
  /** 送る。失敗したら投げる(モーダルにエラーを出して開いたままにする) */
  onSubmit: (info: MatchInfo) => Promise<void>;
};

/** 作った人が試合のタイトル・内容を直すモーダル */
export default function MatchInfoModal({ title, submitLabel, initial, onClose, onSubmit }: Props) {
  const T = useT();
  const [info, setInfo] = useState<MatchInfo>(initial ?? { title: "", description: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);

  async function submit() {
    setSending(true);
    setError(null);
    try {
      await onSubmit({
        title: info.title.trim(),
        description: info.description.trim(),
      });
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
            className="MatchInfoSubmit primary"
            onClick={submit}
            disabled={sending}
          >
            {sending ? T.saving : submitLabel}
          </button>
        </>
      }
    >
      <div className="MatchInfoModal stack">
        {error && <ApiErrorAlert error={error} />}
        <MatchInfoFields
          info={info}
          onChange={setInfo}
        />
      </div>
    </Modal>
  );
}
