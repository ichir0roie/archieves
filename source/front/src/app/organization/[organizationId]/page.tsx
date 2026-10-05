"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import ExternalLink from "@/components/ExternalLink";
import PageHeader from "@/components/PageHeader";
import {
  OrganizationRead,
  getOrganization,
  toErrorDetails,
  type ErrorDetails,
} from "@/lib/api";
import { T } from "@/lib/text";

export default function Page() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = Number(params.organizationId);

  const [organization, setOrganization] = useState<OrganizationRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorDetails | null>(null);

  useEffect(() => {
    if (!Number.isFinite(organizationId)) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getOrganization(organizationId);
        if (!cancelled) setOrganization(data);
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
  }, [organizationId]);

  return (
    <div className="page">
      <PageHeader title={T.profile.organization.title} />
      {error && <ApiErrorAlert error={error} />}

      {loading && <p className="status empty">{T.loading}</p>}

      {!loading && organization && (
        <section className="panel profile-card">
          <div className="profile-item">
            <span className="profile-name">{organization.name}</span>
            {organization.formal_name && <span className="muted small">{organization.formal_name}</span>}
          </div>

          {organization.description && <p>{organization.description}</p>}

          {organization.location && (
            <div className="profile-item">
              <span className="section-label">{T.profile.organization.location}</span>
              <span>{organization.location}</span>
            </div>
          )}

          {organization.homepage_url && (
            <div className="profile-item">
              <span className="section-label">{T.profile.organization.homepage}</span>
              <ExternalLink href={organization.homepage_url}>{organization.homepage_url}</ExternalLink>
            </div>
          )}

          {organization.parent_organization && (
            <div className="profile-item">
              <span className="section-label">{T.profile.organization.parent}</span>
              <Link href={`/organization/${organization.parent_organization.id}`}>
                {organization.parent_organization.name}
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
