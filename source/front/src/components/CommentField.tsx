"use client";

import { useState } from "react";
import Field from "@/components/Field";
import Modal from "@/components/Modal";
import { MAX_COMMENT_LENGTH } from "@/lib/comment";
import { T } from "@/lib/text";

// app/score-view/page.tsx でも使うので、この形を変えない
type Props = {
  /** コメントを付ける先(「END 3」など)。モーダルの見出しになる */
  title: string;
  /** このゲーム・ラウンド・エンドに保存済みのコメント */
  body: string | null;
  /** 書き直した文で呼ぶ。空の文は「コメントを消す」。reject するとモーダルは文を残したまま開いておく */
  onSave: (body: string) => void | Promise<void>;
  disabled?: boolean;
  /** まだコメントが無いときに文の代わりに出す */
  emptyText?: string;
  className?: string;
};

/**
 * 一つのコメント。左に書くためのアイコン、隣に保存済みの文。
 * アイコンを押すと同じ文を入れたモーダルが開き、保存すると別のコメントを足さずにそれを書き換える。
 */
export default function CommentField(props: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function openEditor() {
    setDraft(props.body ?? "");
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      await props.onSave(draft.trim());
      setOpen(false);
    } catch {
      // 何が落ちたかは後ろの画面が出す。要求が落ちても文を失わないよう、モーダルは開いたままにする
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`CommentField comment-field ${props.className ?? ""}`}>
      <button
        type="button"
        className={`ghost icon ${props.body ? "has-body" : ""}`}
        aria-label={T.game.comment.open(props.title)}
        disabled={props.disabled}
        onClick={openEditor}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
      </button>
      <span className={`CommentText text ${props.body ? "" : "empty"}`}>
        {props.body ?? props.emptyText ?? ""}
      </span>

      {open && (
        <Modal
          title={T.game.comment.modalTitle(props.title)}
          onClose={() => setOpen(false)}
          actions={
            <>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                {T.cancel}
              </button>
              <button
                type="button"
                className="primary"
                onClick={save}
                disabled={saving}
              >
                {T.save}
              </button>
            </>
          }
        >
          <Field label={T.game.comment.label}>
            {(id) => (
              <textarea
                id={id}
                autoFocus
                value={draft}
                maxLength={MAX_COMMENT_LENGTH}
                onChange={(event) => setDraft(event.target.value)}
              />
            )}
          </Field>
        </Modal>
      )}
    </div>
  );
}
