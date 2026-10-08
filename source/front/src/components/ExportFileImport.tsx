"use client";

import { useRef, useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import Field from "@/components/Field";
import {
  ImportResult,
  importExportFile,
  toErrorDetails,
  type ErrorDetails,
  type ImportSource,
} from "@/lib/api";
import { useT } from "@/lib/text";

// 種類ごとに選べるファイルの拡張子。API の IMPORTERS の allowed_suffixes と揃える
const ACCEPT_BY_SOURCE: Record<ImportSource, string> = {
  android_mytargets: ".sqlite,.sqlite3,.db",
  archieves: ".db,.sqlite,.sqlite3",
};

const SOURCES = Object.keys(ACCEPT_BY_SOURCE) as ImportSource[];

export default function ExportFileImport() {
  const T = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<ImportSource>(SOURCES[0]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function clearFile() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFileName(null);
  }

  function handleSourceChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSource(e.target.value as ImportSource);
    // 選んだファイルが別の種類のものになるので選び直してもらう
    clearFile();
    setResult(null);
    setError(null);
  }

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
      const imported = await importExportFile(source, file);
      setResult(imported);
      clearFile();
    } catch (e) {
      setError(toErrorDetails(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="panel stack">
        <h2>{T.profile.import.title}</h2>

        <Field
          label={T.profile.import.source}
          hint={T.profile.import.descriptions[source]}
        >
          {(id) => (
            <select
              id={id}
              value={source}
              onChange={handleSourceChange}
              disabled={uploading}
            >
              {SOURCES.map((s) => (
                <option
                  key={s}
                  value={s}
                >
                  {T.profile.import.sources[s]}
                </option>
              ))}
            </select>
          )}
        </Field>

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
          accept={ACCEPT_BY_SOURCE[source]}
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
