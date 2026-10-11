"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import Field from "@/components/Field";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/hooks/useLoad";
import {
  createFeedback,
  listFeedbacks,
  toErrorDetails,
  type ErrorDetails,
} from "@/lib/api";
import { formatDateTime } from "@/lib/formatDateTime";
import { MAX_FEEDBACK_LENGTH } from "@/lib/support";
import { useT } from "@/lib/text";

export default function Page() {
  const T = useT();
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<ErrorDetails | null>(null);
  // 送ったあとに一覧を読み直すための鍵
  const [version, setVersion] = useState(0);
  const { data: feedbacks, loading, error } = useLoad(listFeedbacks, [version]);

  async function handleSubmit() {
    setSending(true);
    setSent(false);
    setSendError(null);
    try {
      await createFeedback({
        body: body.trim(),
        email: email.trim() || null,
      });
      setBody("");
      setSent(true);
      setVersion((v) => v + 1);
    } catch (e) {
      setSendError(toErrorDetails(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page">
      <PageHeader title={T.support.feedback.title} />

      <section className="panel stack">
        <p className="muted small">{T.support.feedback.description}</p>
        {sendError && <ApiErrorAlert error={sendError} />}
        {sent && <p className="status ok">{T.support.feedback.sent}</p>}
        <Field
          label={T.support.feedback.body}
          required
        >
          {(id) => (
            <textarea
              id={id}
              value={body}
              maxLength={MAX_FEEDBACK_LENGTH}
              rows={5}
              onChange={(e) => setBody(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={T.support.feedback.email}
          hint={T.support.feedback.emailHint}
        >
          {(id) => (
            <input
              id={id}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <button
          type="button"
          className="primary large block"
          onClick={handleSubmit}
          disabled={sending || !body.trim()}
        >
          {sending ? T.support.feedback.submitting : T.support.feedback.submit}
        </button>
      </section>

      <section className="stack tight">
        <span className="section-label">{T.support.feedback.history}</span>
        {error && <ApiErrorAlert error={error} />}
        {loading && !feedbacks ? (
          <p className="status empty">{T.loading}</p>
        ) : feedbacks && feedbacks.length === 0 ? (
          <p className="status empty">{T.support.feedback.empty}</p>
        ) : (
          feedbacks?.map((feedback) => (
            <article
              key={feedback.id}
              className="FeedbackItem panel stack tight"
            >
              <p className="muted small">{formatDateTime(feedback.created_at)}</p>
              <p className="pre-wrap">{feedback.body}</p>
              {feedback.reply ? (
                <div className="status info stack tight">
                  <span className="small">
                    {T.support.feedback.reply}
                    {feedback.replied_at && ` · ${formatDateTime(feedback.replied_at)}`}
                  </span>
                  <p className="pre-wrap">{feedback.reply}</p>
                </div>
              ) : (
                <p className="muted small">{T.support.feedback.noReply}</p>
              )}
            </article>
          ))
        )}
      </section>
      <BackButton />
    </div>
  );
}
