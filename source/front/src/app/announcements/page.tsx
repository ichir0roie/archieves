"use client";

import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/hooks/useLoad";
import { listAnnouncements } from "@/lib/api";
import { formatDateTime } from "@/lib/formatDateTime";
import { useT } from "@/lib/text";

/** 直近のお知らせ。ホームで API を叩かないよう、ホームから分けた。 */
export default function Page() {
  const T = useT();
  const { data, loading, error } = useLoad(listAnnouncements, []);

  return (
    <div className="page">
      <PageHeader title={T.support.announcements.title} />
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
      <BackButton />
    </div>
  );
}
