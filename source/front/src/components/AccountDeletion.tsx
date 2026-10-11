"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import Modal from "@/components/Modal";
import { toErrorDetails, type ErrorDetails } from "@/lib/api";
import { deleteCurrentAccount } from "@/lib/auth/currentUser";
import { useT } from "@/lib/text";

/** 設定画面の、アカウントを消す枠。消したら Cognito ではサインインの画面に、モックでは登録の画面に戻る */
export default function AccountDeletion() {
  const T = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteCurrentAccount();
      router.replace("/");
    } catch (e) {
      setError(toErrorDetails(e));
      setConfirming(false);
      setDeleting(false);
    }
  }

  return (
    <section className="AccountDeletion panel stack">
      <h2>{T.settings.deleteAccount.title}</h2>
      <p className="muted small">{T.settings.deleteAccount.description}</p>

      {error && <ApiErrorAlert error={error} />}

      <button
        type="button"
        className="danger block"
        onClick={() => setConfirming(true)}
      >
        {T.settings.deleteAccount.submit}
      </button>

      {confirming && (
        <Modal
          title={T.settings.deleteAccount.confirmTitle}
          onClose={() => setConfirming(false)}
          actions={
            <>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
              >
                {T.cancel}
              </button>
              <button
                type="button"
                className="danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? T.settings.deleteAccount.deleting : T.delete}
              </button>
            </>
          }
        >
          <p>{T.settings.deleteAccount.confirm}</p>
        </Modal>
      )}
    </section>
  );
}
