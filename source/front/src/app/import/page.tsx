"use client";

import { useRef, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Header from "@/components/Header";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import {
  Box,
  Button,
  Card,
  CardContent,
  Fade,
  Stack,
  Typography,
} from "@mui/material";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import {
  ImportResult,
  importSqliteBackup,
  toErrorDetails,
  type ErrorDetails,
} from "@/lib/api";

export default function Page() {
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
    <AuthGate>
      <main className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Header pageName="インポート" showBack />
        <Box className="flex flex-col items-center px-4 py-8">
          <Fade in timeout={400}>
            <Card
              elevation={0}
              className="w-full max-w-sm rounded-3xl overflow-hidden bg-white/85 backdrop-blur-sm border border-white/60 shadow-xl shadow-indigo-100/60"
            >
              <CardContent className="!p-6">
                <Stack spacing={2.5}>
                  <Typography variant="body2" className="!text-slate-500">
                    旧アプリの記録データが入った SQLite バックアップファイル
                    (.sqlite / .sqlite3 / .db) をアップロードすると、自分の記録として取り込みます。
                  </Typography>

                  {error && <ApiErrorAlert error={error} />}

                  {result && !error && (
                    <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                      <p>インポートが完了しました</p>
                      <p className="mt-1 font-normal">
                        大会 {result.games} 件 / ラウンド {result.rounds} 件 / エンド{" "}
                        {result.ends} 件 / 矢 {result.points} 本
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

                  <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    startIcon={<UploadFileRoundedIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="!py-3 !rounded-2xl !font-semibold !text-base !normal-case"
                  >
                    {fileName ?? "ファイルを選択"}
                  </Button>

                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    onClick={handleImport}
                    disabled={uploading || !fileName}
                    className="!py-3 !rounded-2xl !font-semibold !text-base !normal-case !shadow-lg !shadow-indigo-200"
                  >
                    {uploading ? "インポート中..." : "インポート"}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Fade>
        </Box>
      </main>
    </AuthGate>
  );
}
