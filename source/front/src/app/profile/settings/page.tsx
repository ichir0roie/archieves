"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import Combobox from "@/components/Combobox";
import Field from "@/components/Field";
import PageHeader from "@/components/PageHeader";
import {
  OrganizationSummary,
  UserRead,
  findOrCreateOrganization,
  getOrganization,
  getUser,
  searchOrganizations,
  toErrorDetails,
  updateUser,
  type ErrorDetails,
} from "@/lib/api";
import { getCurrentAppUser } from "@/lib/auth/currentUser";
import { useT } from "@/lib/text";

export default function Page() {
  const T = useT();
  const router = useRouter();
  const [userId, setUserId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [age, setAge] = useState("");
  const [organizationInputValue, setOrganizationInputValue] = useState("");
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [organizationOptions, setOrganizationOptions] = useState<OrganizationSummary[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);

  function applyUser(user: UserRead) {
    setName(user.name);
    setNickname(user.nickname ?? "");
    setAge(user.age !== null ? String(user.age) : "");
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { id } = await getCurrentAppUser();
        const user = await getUser(id);
        if (cancelled) return;
        setUserId(id);
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
        age: age === "" ? null : Number(age),
        organization_id: resolvedOrganizationId,
      });
      setUserId(id);
      applyUser(updated);
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
          <Field label={T.profile.settings.age}>
            {(id) => (
              <input
                id={id}
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            )}
          </Field>
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
    </div>
  );
}
