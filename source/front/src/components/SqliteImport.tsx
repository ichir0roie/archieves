"use client";

import { useRef, useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import {
  ImportResult,
  importSqliteBackup,
  toErrorDetails,
  type ErrorDetails,
} from "@/lib/api";
import { useT } from "@/lib/text";

export default function SqliteImport() {
  const T = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setFileName(file?.name ?? null);
    setResult(null);
    setError(null);
  }

  async function handleImport() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const imported = await importSqliteBackup(file);
      setResult(imported);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFileName(null);
    } catch (e) {
      setError(toErrorDetails(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="panel stack">
        <h2>{T.profile.import.title}</h2>
        <p className="muted small import-description">{T.profile.import.description}</p>

        {error && <ApiErrorAlert error={error} />}

        {result && !error && (
          <div className="status ok import-result">
            <p>{T.profile.import.done}</p>
            <p className="summary">
              {T.profile.import.summary(result.games, result.rounds, result.ends, result.points)}
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".sqlite,.sqlite3,.db"
          hidden
          onChange={handleFileChange}
        />

        <button
          type="button"
          className="large block"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {fileName ?? T.profile.import.chooseFile}
        </button>

        <button
          type="button"
          className="primary large block"
          onClick={handleImport}
          disabled={uploading || !fileName}
        >
          {uploading ? T.profile.import.importing : T.profile.import.submit}
        </button>
    </section>
  );
}
