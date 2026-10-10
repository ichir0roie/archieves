"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import Field from "@/components/Field";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/hooks/useLoad";
import {
  listAllFeedbacks,
  replyToFeedback,
  toErrorDetails,
  type AdminFeedbackRead,
  type ErrorDetails,
} from "@/lib/api";
import { formatDateTime } from "@/lib/formatDateTime";
import { useT } from "@/lib/text";

const MAX_REPLY_LENGTH = 2000;

/** 管理者が、全員から届いた意見を見て返信する。管理者でなければ API の 403 をそのまま出す。 */
export default function Page() {
  const T = useT();
  const { data: feedbacks, loading, error } = useLoad(listAllFeedbacks, []);

  return (
    <div className="page">
      <PageHeader title={T.support.adminFeedback.title} />

      <section className="stack tight">
        <p className="muted small">{T.support.adminFeedback.description}</p>
        {error && <ApiErrorAlert error={error} />}
        {loading && !feedbacks ? (
          <p className="status empty">{T.loading}</p>
        ) : feedbacks && feedbacks.length === 0 ? (
          <p className="status empty">{T.support.adminFeedback.empty}</p>
        ) : (
          feedbacks && (
            <>
              <span className="section-label">{T.support.adminFeedback.count(feedbacks.length)}</span>
              {feedbacks.map((feedback) => (
                <FeedbackItem
                  key={feedback.id}
                  initial={feedback}
                />
              ))}
            </>
          )
        )}
      </section>
      <BackButton />
    </div>
  );
}

/** 意見一件と、その返信の欄。返信を送ったら、一覧を読み直さずにこの一件だけを応答で差し替える。 */
function FeedbackItem({ initial }: { initial: AdminFeedbackRead }) {
  const T = useT();
  const [feedback, setFeedback] = useState(initial);
  // 返信がまだなら、はじめから欄を開いておく
  const [editing, setEditing] = useState(!initial.reply);
  const [draft, setDraft] = useState(initial.reply ?? "");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<ErrorDetails | null>(null);

  async function handleSubmit() {
    setSending(true);
    setSendError(null);
    try {
      const updated = await replyToFeedback(feedback.id, { reply: draft.trim() });
      setFeedback(updated);
      setDraft(updated.reply ?? "");
      setEditing(false);
    } catch (e) {
      setSendError(toErrorDetails(e));
    } finally {
      setSending(false);
    }
  }

  function handleCancel() {
    setDraft(feedback.reply ?? "");
    setSendError(null);
    setEditing(false);
  }

  return (
    <article className="AdminFeedbackItem panel stack tight">
      <p className="muted small">
        {formatDateTime(feedback.created_at)}
        {" · "}
        {feedback.user_nickname ?? feedback.user_name}
        {` (id ${feedback.user_id})`}
      </p>
      <p className="muted small">
        {feedback.email
          ? `${T.support.adminFeedback.email}: ${feedback.email}`
          : T.support.adminFeedback.noEmail}
      </p>
      <p className="pre-wrap">{feedback.body}</p>

      {feedback.reply && !editing && (
        <div className="status info stack tight">
          <span className="small">
            {T.support.adminFeedback.replied}
            {feedback.replied_at && ` · ${formatDateTime(feedback.replied_at)}`}
          </span>
          <p className="pre-wrap">{feedback.reply}</p>
          <button
            type="button"
            className="ghost"
            onClick={() => setEditing(true)}
          >
            {T.support.adminFeedback.editReply}
          </button>
        </div>
      )}

      {editing && (
        <>
          {sendError && <ApiErrorAlert error={sendError} />}
          <Field
            label={T.support.adminFeedback.reply}
            hint={T.support.adminFeedback.replyHint}
          >
            {(id) => (
              <textarea
                id={id}
                value={draft}
                maxLength={MAX_REPLY_LENGTH}
                rows={3}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
          </Field>
          <div className="row">
            {feedback.reply && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={sending}
              >
                {T.support.adminFeedback.cancel}
              </button>
            )}
            <button
              type="button"
              className="primary"
              onClick={handleSubmit}
              disabled={sending || !draft.trim()}
            >
              {sending
                ? T.support.adminFeedback.submitting
                : feedback.reply
                  ? T.support.adminFeedback.updateReply
                  : T.support.adminFeedback.submitReply}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
