"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import Combobox from "@/components/Combobox";
import Field from "@/components/Field";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import Segment from "@/components/Segment";
import {
  MeRead,
  OrganizationSummary,
  Visibility,
  findOrCreateOrganization,
  getOrganization,
  searchOrganizations,
  toErrorDetails,
  updateUser,
  type ErrorDetails,
} from "@/lib/api";
import {
  getCurrentAppUser,
  refreshCurrentAppUser,
  updateCachedAppUser,
} from "@/lib/auth/currentUser";
import { useT } from "@/lib/text";

const VISIBILITIES: Array<Visibility> = [
  "private",
  "organization",
  "public",
];

export default function Page() {
  const T = useT();
  const VISIBILITY_OPTIONS = VISIBILITIES.map((visibility) => ({
    value: visibility,
    label: T.profile.settings.visibility[visibility],
  }));
  const router = useRouter();
  const [userId, setUserId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [age, setAge] = useState<number | null>(null);
  const [organizationInputValue, setOrganizationInputValue] = useState("");
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [organizationOptions, setOrganizationOptions] = useState<OrganizationSummary[]>([]);
  const [profileVisibility, setProfileVisibility] = useState<Visibility>("private");
  const [rankingVisibility, setRankingVisibility] = useState<Visibility>("private");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);

  function applyUser(user: MeRead) {
    setName(user.name);
    setNickname(user.nickname ?? "");
    setBirthDate(user.birth_date ?? "");
    setAge(user.age);
    setProfileVisibility(user.profile_visibility);
    setRankingVisibility(user.ranking_visibility);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // 登録(行が無ければ作る)を兼ねる。キャッシュの名前・管理者のフラグもここで新しくする
        const { user } = await refreshCurrentAppUser();
        if (cancelled) return;
        setUserId(user.id);
        applyUser(user);
        if (user.organization_id !== null) {
          const organization = await getOrganization(user.organization_id);
          if (!cancelled) {
            setOrganizationId(organization.id);
            setOrganizationInputValue(organization.name);
          }
        }
      } catch (e) {
        if (!cancelled) setError(toErrorDetails(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const text = organizationInputValue.trim();
    if (text === "") {
      setOrganizationOptions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await searchOrganizations(text);
        if (!cancelled) setOrganizationOptions(results);
      } catch {
        if (!cancelled) setOrganizationOptions([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [organizationInputValue]);

  async function resolveOrganizationId(): Promise<number | null> {
    const text = organizationInputValue.trim();
    if (text === "") return null;
    if (organizationId !== null) return organizationId;
    const organization = await findOrCreateOrganization({ name: text });
    return organization.id;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const id = userId ?? (await getCurrentAppUser()).id;
      const resolvedOrganizationId = await resolveOrganizationId();
      const updated = await updateUser(id, {
        name,
        nickname: nickname || null,
        birth_date: birthDate || null,
        organization_id: resolvedOrganizationId,
        profile_visibility: profileVisibility,
        ranking_visibility: rankingVisibility,
      });
      setUserId(id);
      applyUser(updated);
      await updateCachedAppUser(updated);
      setOrganizationId(resolvedOrganizationId);
      router.push("/");
    } catch (e) {
      setError(toErrorDetails(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <PageHeader title={T.profile.settings.title} />
      {loading ? (
        <p className="status empty">{T.loading}</p>
      ) : (
        <div className="panel stack">
          {error && <ApiErrorAlert error={error} />}

          <Field
            label={T.profile.settings.name}
            required
          >
            {(id) => (
              <input
                id={id}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
          </Field>
          <Field label={T.profile.settings.nickname}>
            {(id) => (
              <input
                id={id}
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            )}
          </Field>
          <Field label={T.profile.settings.birthDate}>
            {(id) => (
              <input
                id={id}
                type="date"
                value={birthDate}
                max={todayLocal()}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            )}
          </Field>
          {age !== null && <p className="muted">{T.profile.settings.age(age)}</p>}
          <Field label={T.profile.settings.organization}>
            {(id) => (
              <Combobox
                id={id}
                value={organizationInputValue}
                onInput={(text) => {
                  setOrganizationInputValue(text);
                  // 打ち直したら選んでいた団体を外し、保存のときに名前で引き直す(無ければ作る)
                  setOrganizationId(null);
                }}
                onSelect={(option) => {
                  setOrganizationId(option.id);
                  setOrganizationInputValue(option.label);
                }}
                options={organizationOptions.map((organization) => ({
                  id: organization.id,
                  label: organization.name,
                }))}
              />
            )}
          </Field>
          <div className="field">
            <span className="field-label">{T.profile.settings.profileVisibility}</span>
            <Segment
              options={VISIBILITY_OPTIONS}
              value={profileVisibility}
              onChange={setProfileVisibility}
              label={T.profile.settings.profileVisibility}
            />
          </div>
          <div className="field">
            <span className="field-label">{T.profile.settings.rankingVisibility}</span>
            <Segment
              options={VISIBILITY_OPTIONS}
              value={rankingVisibility}
              onChange={setRankingVisibility}
              label={T.profile.settings.rankingVisibility}
            />
          </div>
          <p className="muted small">{T.profile.settings.visibilityHint}</p>

          <button
            type="button"
            className="primary large block"
            onClick={handleSave}
            disabled={saving || !name}
          >
            {saving ? T.saving : T.save}
          </button>
        </div>
      )}
      <BackButton />
    </div>
  );
}

// toISOString は UTC なので、日本の朝 9 時前だと前日になる。手元の日付で組む
function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
