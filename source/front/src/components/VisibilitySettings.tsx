"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import Segment from "@/components/Segment";
import {
  getMyUser,
  toErrorDetails,
  updateUser,
  type ErrorDetails,
  type MeRead,
  type Visibility,
} from "@/lib/api";
import { useLoad } from "@/hooks/useLoad";
import { useT } from "@/lib/text";

const VISIBILITIES: Array<Visibility> = [
  "private",
  "organization",
  "public",
];

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

  const options = VISIBILITIES.map((visibility) => ({
    value: visibility,
    label: T.profile.settings.visibility[visibility],
  }));

  async function save(change: Partial<Pick<MeRead, "profile_visibility" | "ranking_visibility">>) {
    if (!me) return;
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
      <div className="field">
        <span className="field-label">{T.profile.settings.profileVisibility}</span>
        <Segment
          options={options}
          value={me.profile_visibility}
          onChange={(value) => save({ profile_visibility: value })}
          label={T.profile.settings.profileVisibility}
        />
      </div>
      <div className="field">
        <span className="field-label">{T.profile.settings.rankingVisibility}</span>
        <Segment
          options={options}
          value={me.ranking_visibility}
          onChange={(value) => save({ ranking_visibility: value })}
          label={T.profile.settings.rankingVisibility}
        />
      </div>
      <p className="muted small">{T.profile.settings.visibilityHint}</p>
      <p
        className="muted small"
        role="status"
      >
        {saving ? T.saving : saved ? T.saved : ""}
      </p>
    </section>
  );
}
