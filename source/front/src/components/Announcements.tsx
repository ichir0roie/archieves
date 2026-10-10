"use client";

import ApiErrorAlert from "@/components/ApiErrorAlert";
import { useLoad } from "@/hooks/useLoad";
import { listAnnouncements } from "@/lib/api";
import { formatDateTime } from "@/lib/formatDateTime";
import { useT } from "@/lib/text";

/** ホームに出す直近のお知らせ。 */
export default function Announcements() {
  const T = useT();
  const { data, loading, error } = useLoad(listAnnouncements, []);

  return (
    <section className="stack tight">
      <span className="section-label">{T.support.announcements.title}</span>
      {error && <ApiErrorAlert error={error} />}
      {loading && !data ? (
        <p className="status empty">{T.loading}</p>
      ) : data && data.length === 0 ? (
        <p className="status empty">{T.support.announcements.empty}</p>
      ) : (
        <ul className="Announcements panel stack tight">
          {data?.map((announcement) => (
            <li key={announcement.id}>
              <p className="muted small">{formatDateTime(announcement.published_at)}</p>
              <p className="pre-wrap">{announcement.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
