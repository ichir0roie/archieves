"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import { exportRecords, toErrorDetails, type ErrorDetails } from "@/lib/api";
import { useT } from "@/lib/text";

export default function RecordsExport() {
  const T = useT();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await exportRecords();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(toErrorDetails(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="panel stack">
      <h2>{T.settings.export.title}</h2>
      <p className="muted small">{T.settings.export.description}</p>

      {error && <ApiErrorAlert error={error} />}

      <button
        type="button"
        className="primary large block"
        onClick={handleExport}
        disabled={exporting}
      >
        {exporting ? T.settings.export.exporting : T.settings.export.submit}
      </button>
    </section>
  );
}
