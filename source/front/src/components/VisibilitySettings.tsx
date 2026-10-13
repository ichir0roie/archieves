"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import VisibilityFields from "@/components/VisibilityFields";
import {
  getMyUser,
  toErrorDetails,
  updateUser,
  type ErrorDetails,
  type MeRead,
} from "@/lib/api";
import { useLoad } from "@/hooks/useLoad";
import { useT } from "@/lib/text";

/** 本人のプロフィールの画面で、公開範囲を選んだらすぐに保存する。 */
export default function VisibilitySettings() {
  const T = useT();
  const loaded = useLoad(() => getMyUser(), []);
  // 保存したあとの行。保存するまでは読んだ行を出す
  const [updated, setUpdated] = useState<MeRead | null>(null);
  const me = updated ?? loaded.data;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);

  async function save(change: Partial<Pick<MeRead, "profile_visibility" | "ranking_visibility" | "score_visibility">>) {
    // 保存の途中は選べなくしてある。重なると、先に送った方の応答が後から着いて選び直しを戻すため
    if (!me || saving) return;
    const before = me;
    // 押したボタンをすぐに on にし、落ちたら戻す
    setUpdated({ ...me, ...change });
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      setUpdated(await updateUser(me.id, change));
      setSaved(true);
    } catch (e) {
      setUpdated(before);
      setError(toErrorDetails(e));
    } finally {
      setSaving(false);
    }
  }

  if (loaded.error) return <ApiErrorAlert error={loaded.error} />;
  if (!me) return null;

  return (
    <section className="VisibilitySettings panel stack">
      <h2>{T.profile.view.visibilityTitle}</h2>
      {error && <ApiErrorAlert error={error} />}
      <VisibilityFields
        profileVisibility={me.profile_visibility}
        rankingVisibility={me.ranking_visibility}
        scoreVisibility={me.score_visibility}
        onChangeProfileVisibility={(value) => save({ profile_visibility: value })}
        onChangeRankingVisibility={(value) => save({ ranking_visibility: value })}
        onChangeScoreVisibility={(value) => save({ score_visibility: value })}
        disabled={saving}
      />
      <p
        className="muted small"
        role="status"
      >
        {saving ? T.saving : saved ? T.saved : ""}
      </p>
    </section>
  );
}
