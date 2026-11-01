"use client";

import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import Field from "@/components/Field";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import { useLoad } from "@/hooks/useLoad";
import {
  listAdminOrganizations,
  toErrorDetails,
  updateOrganization,
  type AdminOrganizationRead,
  type ErrorDetails,
} from "@/lib/api";
import { useT } from "@/lib/text";

/** 管理者が組織の名前・所在・ホームページなどを直す。組織は所属に名前を打つと自動で増える */
export default function Page() {
  const T = useT();
  const { data: loaded, loading, error } = useLoad(listAdminOrganizations, []);
  // 直した行は、一覧を読み直さずに応答で差し替える
  const [updated, setUpdated] = useState<Record<number, AdminOrganizationRead>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const organizations = loaded?.map((organization) => updated[organization.id] ?? organization) ?? null;
  const editing = organizations?.find((organization) => organization.id === editingId) ?? null;

  return (
    <div className="AdminOrganizations page">
      <PageHeader title={T.support.adminOrganizations.title} />
      <p className="muted small">{T.support.adminOrganizations.description}</p>
      {error && <ApiErrorAlert error={error} />}
      {loading && !organizations ? (
        <p className="status empty">{T.loading}</p>
      ) : organizations && organizations.length === 0 ? (
        <p className="status empty">{T.support.adminOrganizations.empty}</p>
      ) : (
        organizations && (
          <div className="row-list">
            {organizations.map((organization) => (
              <button
                key={organization.id}
                type="button"
                className="AdminOrganizationRow"
                onClick={() => setEditingId(organization.id)}
              >
                <span className="main">
                  <span>{organization.name}</span>
                  <span className="muted small">
                    {[
                      T.support.adminOrganizations.id(organization.id),
                      organization.location,
                      organization.parent_organization?.name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="side muted small">
                  {T.support.adminOrganizations.userCount(organization.user_count)}
                </span>
              </button>
            ))}
          </div>
        )
      )}
      {editing && organizations && (
        <OrganizationEditor
          organization={editing}
          organizations={organizations}
          onClose={() => setEditingId(null)}
          onSaved={(saved) => {
            setUpdated((prev) => ({ ...prev, [saved.id]: saved }));
            setEditingId(null);
          }}
        />
      )}
      <BackButton />
    </div>
  );
}

/** organizationId 自身と、その下(子・孫…)の組織の id。上位の組織に選ぶと輪になるので選ばせない */
function selfAndDescendants(
  organizationId: number,
  organizations: ReadonlyArray<AdminOrganizationRead>,
): Set<number> {
  const found = new Set([organizationId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const organization of organizations) {
      const parentId = organization.parent_organization_id;
      if (parentId !== null && found.has(parentId) && !found.has(organization.id)) {
        found.add(organization.id);
        grew = true;
      }
    }
  }
  return found;
}

/** 空の欄は null(空にする)で送る */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

type EditorProps = {
  organization: AdminOrganizationRead;
  organizations: ReadonlyArray<AdminOrganizationRead>;
  onClose: () => void;
  onSaved: (organization: AdminOrganizationRead) => void;
};

function OrganizationEditor({ organization, organizations, onClose, onSaved }: EditorProps) {
  const T = useT();
  const texts = T.support.adminOrganizations;
  const [name, setName] = useState(organization.name);
  const [formalName, setFormalName] = useState(organization.formal_name ?? "");
  const [location, setLocation] = useState(organization.location ?? "");
  const [homepageUrl, setHomepageUrl] = useState(organization.homepage_url ?? "");
  const [description, setDescription] = useState(organization.description ?? "");
  const [parentId, setParentId] = useState(organization.parent_organization_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);
  const excluded = selfAndDescendants(organization.id, organizations);
  const parentOptions = organizations.filter((option) => !excluded.has(option.id));
  const nameMissing = name.trim().length === 0;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await updateOrganization(organization.id, {
          name: name.trim(),
          formal_name: orNull(formalName),
          location: orNull(location),
          homepage_url: orNull(homepageUrl),
          description: orNull(description),
          parent_organization_id: parentId,
        }),
      );
    } catch (e) {
      // 名前の重なり(409)・URL の形(422)は、モーダルを開いたまま出す
      setError(toErrorDetails(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={texts.editTitle(organization.name)}
      onClose={onClose}
      actions={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            {T.cancel}
          </button>
          <button
            type="button"
            className="primary"
            onClick={save}
            disabled={saving || nameMissing}
          >
            {saving ? texts.saving : T.save}
          </button>
        </>
      }
    >
      <div className="stack">
        {error && <ApiErrorAlert error={error} />}
        <Field
          label={texts.name}
          required
          error={nameMissing ? texts.nameRequired : null}
        >
          {(id) => (
            <input
              id={id}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label={texts.formalName}>
          {(id) => (
            <input
              id={id}
              type="text"
              value={formalName}
              onChange={(event) => setFormalName(event.target.value)}
            />
          )}
        </Field>
        <Field label={texts.location}>
          {(id) => (
            <input
              id={id}
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          )}
        </Field>
        <Field
          label={texts.homepage}
          hint={texts.homepageHint}
        >
          {(id) => (
            <input
              id={id}
              type="url"
              value={homepageUrl}
              onChange={(event) => setHomepageUrl(event.target.value)}
            />
          )}
        </Field>
        <Field label={texts.descriptionField}>
          {(id) => (
            <textarea
              id={id}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>
        <Field label={texts.parent}>
          {(id) => (
            <select
              id={id}
              value={parentId ?? ""}
              onChange={(event) =>
                setParentId(event.target.value === "" ? null : Number(event.target.value))
              }
            >
              <option value="">{texts.noParent}</option>
              {parentOptions.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                >
                  {option.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
    </Modal>
  );
}
