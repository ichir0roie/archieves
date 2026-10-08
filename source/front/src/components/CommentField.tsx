"use client";

import { useState } from "react";
import Field from "@/components/Field";
import Modal from "@/components/Modal";
import { MAX_COMMENT_LENGTH } from "@/lib/comment";
import { useT } from "@/lib/text";

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
  /** アイコンだけを出す。保存済みの文は呼ぶ側が別に出す(コメントの無い所が縦に場所を取らないように) */
  iconOnly?: boolean;
};

/**
 * 一つのコメント。左に書くためのアイコン、隣に保存済みの文。
 * アイコンを押すと同じ文を入れたモーダルが開き、保存すると別のコメントを足さずにそれを書き換える。
 */
export default function CommentField(props: Props) {
  const T = useT();
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

  // モーダルは枠の外(兄弟)に置く。枠の onClick がモーダル内の操作で働いて、書きかけを戻さないため
  return (
    <>
      <div
        className={`CommentField comment-field ${props.iconOnly ? "icon-only" : ""} ${props.className ?? ""}`}
        onClick={props.disabled ? undefined : openEditor}
      >
        <button
          type="button"
          className={`ghost icon ${props.body ? "has-body" : ""}`}
          aria-label={T.game.comment.open(props.title)}
          disabled={props.disabled}
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
        {!props.iconOnly && (<span className={`CommentText text ${props.body ? "" : "empty"}`}>
          {props.body ?? props.emptyText ?? ""}
        </span>)}
      </div>

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
    </>
  );
}
