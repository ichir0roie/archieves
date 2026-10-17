"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import Field from "@/components/Field";
import Modal from "@/components/Modal";
import Segment from "@/components/Segment";
import { useLoad } from "@/hooks/useLoad";
import {
  ApiError,
  createAccessToken,
  deleteAccessToken,
  listAccessTokens,
  toErrorDetails,
  type AccessTokenCreated,
  type AccessTokenRead,
  type ErrorDetails,
} from "@/lib/api";
import { formatDateTime } from "@/lib/formatDateTime";
import { useT } from "@/lib/text";

// 有効期限の選択肢(日)。API は 1〜365 日を受ける
const TERMS = ["30", "90", "365"] as const;
type Term = (typeof TERMS)[number];
// API の app/core/access_token.py の MAX_NAME_LENGTH
const MAX_NAME_LENGTH = 50;

/** Claude Code on the web の環境変数に入れる、API の在りか。案内は `${ARCHIEVES_API_URL}/guide` */
function apiUrlEnv(): string {
  return `ARCHIEVES_API_URL=${window.location.origin}/api/v1`;
}

function CopyButton({ text }: { text: string }) {
  const T = useT();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
    >
      {copied ? T.settings.accessTokens.copied : T.settings.accessTokens.copy}
    </button>
  );
}

/** 読むだけの欄と、その値のコピーのボタン */
function CopyableValue({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      {(id) => (
        <div className="row">
          <input
            id={id}
            className="grow"
            type="text"
            value={value}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <CopyButton text={value} />
        </div>
      )}
    </Field>
  );
}

/** 設定画面の、Claude Code などに渡す読み取り専用のトークンを発行・失効させる枠 */
export default function AccessTokens() {
  const T = useT();
  const texts = T.settings.accessTokens;
  // 発行・失効のたびに増やして一覧を読み直す
  const [version, setVersion] = useState(0);
  const tokens = useLoad(() => listAccessTokens(), [version]);
  const [name, setName] = useState<string>(texts.defaultName);
  const [term, setTerm] = useState<Term>("90");
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<AccessTokenCreated | null>(null);
  const [revoking, setRevoking] = useState<AccessTokenRead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);

  async function handleIssue() {
    setIssuing(true);
    setError(null);
    try {
      setIssued(await createAccessToken({ name: name.trim(), expires_in_days: Number(term) }));
      setVersion((v) => v + 1);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? { message: texts.tooMany }
          : toErrorDetails(e),
      );
    } finally {
      setIssuing(false);
    }
  }

  async function handleRevoke(token: AccessTokenRead) {
    setDeleting(true);
    setError(null);
    try {
      await deleteAccessToken(token.id);
      if (issued?.id === token.id) setIssued(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(toErrorDetails(e));
    } finally {
      setDeleting(false);
      setRevoking(null);
    }
  }

  const now = Date.now();

  return (
    <section className="AccessTokens panel stack">
      <h2>{texts.title}</h2>
      <p className="muted small">{texts.description}</p>

      {error && <ApiErrorAlert error={error} />}

      <Field
        label={texts.name}
        hint={texts.nameHint}
        required
      >
        {(id) => (
          <input
            id={id}
            type="text"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <div className="field">
        <span className="field-label">{texts.term}</span>
        <Segment
          options={TERMS.map((value) => ({ value, label: texts.days(Number(value)) }))}
          value={term}
          onChange={setTerm}
          label={texts.term}
          disabled={issuing}
        />
      </div>
      <button
        type="button"
        className="primary large block"
        onClick={handleIssue}
        disabled={issuing || !name.trim()}
      >
        {issuing ? texts.submitting : texts.submit}
      </button>

      {issued && (
        <div className="AccessTokenIssued status ok stack tight">
          <span>{texts.issuedTitle}</span>
          <span className="small">{texts.issuedNote}</span>
          <p className="small">{texts.setupNote}</p>
          <CopyableValue
            label={texts.token}
            value={issued.token}
          />
          <CopyableValue
            label={texts.secretHost}
            value={window.location.host}
          />
          <CopyableValue
            label={texts.envVar}
            value={apiUrlEnv()}
          />
          <div className="row">
            <button
              type="button"
              onClick={() => setIssued(null)}
            >
              {texts.close}
            </button>
          </div>
        </div>
      )}

      <span className="section-label">{texts.listTitle}</span>
      {tokens.error && <ApiErrorAlert error={tokens.error} />}
      {tokens.loading && !tokens.data && <p className="status empty">{T.loading}</p>}
      {tokens.data?.length === 0 && <p className="status empty">{texts.empty}</p>}
      {tokens.data && tokens.data.length > 0 && (
        <div className="row-list">
          {tokens.data.map((token) => (
            <div
              key={token.id}
              className="AccessTokenItem"
            >
              <div className="grow stack tight">
                <span>{token.name}</span>
                <span className="muted small">
                  {`${token.token_prefix}…`}
                  {" · "}
                  {texts.created(formatDateTime(token.created_at))}
                  {" · "}
                  {new Date(token.expires_at).getTime() <= now
                    ? texts.expired
                    : texts.expires(formatDateTime(token.expires_at))}
                </span>
              </div>
              <button
                type="button"
                className="danger"
                onClick={() => setRevoking(token)}
              >
                {texts.revoke}
              </button>
            </div>
          ))}
        </div>
      )}

      {revoking && (
        <Modal
          title={texts.revokeTitle}
          onClose={() => setRevoking(null)}
          actions={
            <>
              <button
                type="button"
                onClick={() => setRevoking(null)}
                disabled={deleting}
              >
                {T.cancel}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => handleRevoke(revoking)}
                disabled={deleting}
              >
                {deleting ? texts.revoking : texts.revoke}
              </button>
            </>
          }
        >
          <p>{texts.revokeConfirm(revoking.name)}</p>
        </Modal>
      )}
    </section>
  );
}
