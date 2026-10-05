import type { ErrorDetails } from "@/lib/api";
import { T } from "@/lib/text";

type Props = {
  error: ErrorDetails;
  className?: string;
};

/** 何が落ちたか(要求・状態・応答の本文)まで出し、壊れた API の呼び出しを画面で追えるようにする。 */
export default function ApiErrorAlert({ error, className }: Props) {
  return (
    <div
      role="alert"
      className={`status error api-error ${className ?? ""}`}
    >
      <div className="title">{error.message}</div>
      {(error.method || error.url) && (
        <p className="detail">
          {error.method} {error.url}
        </p>
      )}
      {error.status !== undefined && <p className="detail">{T.api.status(error.status)}</p>}
      {error.body !== undefined && error.body !== null && (
        <pre className="detail">{typeof error.body === "string" ? error.body : JSON.stringify(error.body, null, 2)}</pre>
      )}
    </div>
  );
}
