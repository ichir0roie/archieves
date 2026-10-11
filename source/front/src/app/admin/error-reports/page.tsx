"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/hooks/useLoad";
import {
  listErrorReports,
  resolveErrorReport,
  type AdminErrorReportRead,
} from "@/lib/api";
import { formatDateTime } from "@/lib/formatDateTime";
import { useT } from "@/lib/text";

/** 管理者が、画面で起きたエラーを見て対応済みにする。 */
export default function Page() {
  const T = useT();
  const { data: loaded, loading, error } = useLoad(listErrorReports, []);
  // 対応済みにした行は、一覧を読み直さずに応答で差し替える
  const [updated, setUpdated] = useState<Record<number, AdminErrorReportRead>>({});
  const reports = loaded?.map((report) => updated[report.id] ?? report) ?? null;
  const unresolved = reports?.filter((report) => report.resolved_at === null).length ?? 0;

  return (
    <div className="page">
      <PageHeader title={T.support.adminErrorReports.title} />

      <section className="stack tight">
        <p className="muted small">{T.support.adminErrorReports.description}</p>
        {error && <ApiErrorAlert error={error} />}
        {loading && !reports ? (
          <p className="status empty">{T.loading}</p>
        ) : reports && reports.length === 0 ? (
          <p className="status empty">{T.support.adminErrorReports.empty}</p>
        ) : (
          reports && (
            <>
              <span className="section-label">
                {T.support.adminErrorReports.unresolvedCount(unresolved)}
              </span>
              {reports.map((report) => (
                <ErrorReportItem
                  key={report.id}
                  report={report}
                  onResolved={(resolved) =>
                    setUpdated((prev) => ({ ...prev, [resolved.id]: resolved }))
                  }
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

type ErrorReportItemProps = {
  report: AdminErrorReportRead;
  onResolved: (report: AdminErrorReportRead) => void;
};

/** エラー一件と、対応済みにするボタン。 */
function ErrorReportItem({ report, onResolved }: ErrorReportItemProps) {
  const T = useT();
  const [sending, setSending] = useState(false);

  async function handleResolve() {
    setSending(true);
    try {
      onResolved(await resolveErrorReport(report.id));
    } finally {
      // 失敗は client.ts が集積に送ってホームへ戻す
      setSending(false);
    }
  }

  return (
    <article className="AdminErrorReportItem panel stack tight">
      <p className="muted small">
        {formatDateTime(report.created_at)}
        {" · "}
        {report.user_id === null
          ? T.support.adminErrorReports.unregistered
          : `${report.user_name ?? ""}${T.support.adminErrorReports.userId(report.user_id)}`}
      </p>
      <p>
        <b>{report.status_code}</b>
        {" "}
        {T.support.adminErrorReports.kind[report.kind]}
        {" · "}
        {report.page_path}
      </p>
      {report.api_path && (
        <p className="muted small">
          {report.method} {report.api_path}
        </p>
      )}
      {report.message && <p className="pre-wrap small">{report.message}</p>}
      {report.resolved_at ? (
        <p className="status info small">
          {T.support.adminErrorReports.resolved}
          {` · ${formatDateTime(report.resolved_at)}`}
        </p>
      ) : (
        <button
          type="button"
          className="primary"
          onClick={handleResolve}
          disabled={sending}
        >
          {sending ? T.support.adminErrorReports.resolving : T.support.adminErrorReports.resolve}
        </button>
      )}
    </article>
  );
}
