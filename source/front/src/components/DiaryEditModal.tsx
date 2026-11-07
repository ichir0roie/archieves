"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import Field from "@/components/Field";
import Modal from "@/components/Modal";
import {
  deleteDiary,
  toErrorDetails,
  updateDiary,
  type DiaryRead,
  type ErrorDetails,
} from "@/lib/api";
import { MAX_DIARY_LENGTH } from "@/lib/diary";
import { useT } from "@/lib/text";

type Props = {
  diary: DiaryRead;
  onClose: () => void;
  /** 保存・削除が済んだあとに呼ぶ。呼ぶ側は一覧を読み直してモーダルを閉じる */
  onChanged: () => void;
};

/** 本人の日記の本文を直す・消すモーダル。削除は同じモーダルの中で確かめてから送る */
export default function DiaryEditModal({ diary, onClose, onChanged }: Props) {
  const T = useT();
  const [body, setBody] = useState(diary.body);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);
  const trimmed = body.trim();

  async function run(action: () => Promise<unknown>) {
    setSending(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(toErrorDetails(e));
      setSending(false);
    }
  }

  if (confirmingDelete) {
    return (
      <Modal
        title={T.diary.deleteConfirmTitle}
        onClose={onClose}
        actions={
          <>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={sending}
            >
              {T.cancel}
            </button>
            <button
              type="button"
              className="DiaryDeleteConfirm danger"
              onClick={() => run(() => deleteDiary(diary.id))}
              disabled={sending}
            >
              {T.delete}
            </button>
          </>
        }
      >
        {error && <ApiErrorAlert error={error} />}
        <p>{T.diary.deleteConfirm}</p>
      </Modal>
    );
  }

  return (
    <Modal
      title={T.diary.editTitle}
      onClose={onClose}
      actions={
        <>
          <button
            type="button"
            className="DiaryDelete danger modal-actions-start"
            onClick={() => setConfirmingDelete(true)}
            disabled={sending}
          >
            {T.delete}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
          >
            {T.cancel}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => run(() => updateDiary(diary.id, { body: trimmed }))}
            disabled={sending || !trimmed || trimmed === diary.body}
          >
            {sending ? T.saving : T.save}
          </button>
        </>
      }
    >
      <div className="stack">
        {error && <ApiErrorAlert error={error} />}
        <Field
          label={T.diary.body}
          required
        >
          {(id) => (
            <textarea
              id={id}
              value={body}
              maxLength={MAX_DIARY_LENGTH}
              rows={10}
              onChange={(e) => setBody(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
