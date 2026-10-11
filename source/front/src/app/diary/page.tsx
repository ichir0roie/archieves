"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import DiaryCell from "@/components/DiaryCell";
import Field from "@/components/Field";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/hooks/useLoad";
import {
  createDiary,
  listDiaries,
  toErrorDetails,
  type ErrorDetails,
} from "@/lib/api";
import { MAX_DIARY_LENGTH, RECENT_DIARY_LIMIT } from "@/lib/diary";
import { formatDateTime } from "@/lib/formatDateTime";
import { useT } from "@/lib/text";

export default function Page() {
  const T = useT();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<ErrorDetails | null>(null);
  // 書いたあとに一覧を読み直すための鍵
  const [version, setVersion] = useState(0);
  const { data: diaries, loading, error } = useLoad(
    () => listDiaries({ limit: RECENT_DIARY_LIMIT }),
    [version],
  );

  async function handleSubmit() {
    setSending(true);
    setSendError(null);
    try {
      await createDiary({ body: body.trim() });
      setBody("");
      setVersion((v) => v + 1);
    } catch (e) {
      setSendError(toErrorDetails(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page">
      <PageHeader title={T.diary.title} />

      <section className="panel stack">
        <p className="muted small">{T.diary.description}</p>
        {sendError && <ApiErrorAlert error={sendError} />}
        <Field
          label={T.diary.body}
          required
        >
          {(id) => (
            <textarea
              id={id}
              value={body}
              maxLength={MAX_DIARY_LENGTH}
              rows={6}
              onChange={(e) => setBody(e.target.value)}
            />
          )}
        </Field>
        <button
          type="button"
          className="primary large block"
          onClick={handleSubmit}
          disabled={sending || !body.trim()}
        >
          {sending ? T.diary.submitting : T.diary.submit}
        </button>
      </section>

      <section className="stack tight">
        <span className="section-label">{T.diary.recent}</span>
        {error && <ApiErrorAlert error={error} />}
        {loading && !diaries ? (
          <p className="status empty">{T.loading}</p>
        ) : diaries && diaries.length === 0 ? (
          <p className="status empty">{T.diary.empty}</p>
        ) : (
          diaries && (
            <div className="DiaryCells">
              {diaries.map((diary) => (
                <DiaryCell
                  key={diary.id}
                  diary={diary}
                  date={formatDateTime(diary.created_at)}
                />
              ))}
            </div>
          )
        )}
      </section>
      <button
        type="button"
        className="DiaryListLink block"
        onClick={() => router.push("/diary/list")}
      >
        {T.diary.toList}
      </button>
      <BackButton />
    </div>
  );
}
