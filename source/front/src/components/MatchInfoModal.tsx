"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import Field from "@/components/Field";
import Modal from "@/components/Modal";
import { toErrorDetails, type ErrorDetails } from "@/lib/api";
import {
  MATCH_DESCRIPTION_MAX_LENGTH,
  MATCH_TITLE_MAX_LENGTH,
  type MatchInfo,
} from "@/lib/score/match";
import { useT } from "@/lib/text";

type Props = {
  title: string;
  submitLabel: string;
  initial?: MatchInfo;
  onClose: () => void;
  /** 送る。失敗したら投げる(モーダルにエラーを出して開いたままにする) */
  onSubmit: (info: MatchInfo) => Promise<void>;
};

/** 試合のタイトル・内容を入れるモーダル。作るとき(設定の画面)と、作った人が直すときに使う */
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
        <Field
          label={T.match.info.title}
          hint={T.match.info.titleHint}
        >
          {(id) => (
            <input
              id={id}
              type="text"
              className="MatchInfoTitle"
              value={info.title}
              maxLength={MATCH_TITLE_MAX_LENGTH}
              onChange={(e) => setInfo({ ...info, title: e.target.value })}
            />
          )}
        </Field>
        <Field
          label={T.match.info.description}
          hint={T.match.info.descriptionHint}
        >
          {(id) => (
            <textarea
              id={id}
              className="MatchInfoDescription"
              value={info.description}
              maxLength={MATCH_DESCRIPTION_MAX_LENGTH}
              rows={6}
              onChange={(e) => setInfo({ ...info, description: e.target.value })}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
