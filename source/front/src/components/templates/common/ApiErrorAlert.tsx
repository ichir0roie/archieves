"use client";

import { Alert, AlertTitle } from "@mui/material";
import type { ErrorDetails } from "@/lib/api";

interface Props {
  error: ErrorDetails;
  className?: string;
}

/** Shows what actually failed (endpoint, status, response body) so a broken API call is debuggable on-screen. */
export default function ApiErrorAlert({ error, className }: Props) {
  return (
    <Alert severity="error" className={className}>
      <AlertTitle>{error.message}</AlertTitle>
      {(error.method || error.url) && (
        <div className="font-mono text-xs break-all">
          {error.method} {error.url}
        </div>
      )}
      {error.status !== undefined && (
        <div className="font-mono text-xs">status: {error.status}</div>
      )}
      {error.body !== undefined && error.body !== null && (
        <pre className="font-mono text-xs whitespace-pre-wrap break-all mt-1">
          {typeof error.body === "string" ? error.body : JSON.stringify(error.body, null, 2)}
        </pre>
      )}
    </Alert>
  );
}
