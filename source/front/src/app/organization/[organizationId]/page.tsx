"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import ExternalLink from "@/components/ExternalLink";
import PageHeader from "@/components/PageHeader";
import { getOrganization } from "@/lib/api";
import { useLoad } from "@/hooks/useLoad";
import { useT } from "@/lib/text";

export default function Page() {
  const T = useT();
  const params = useParams<{ organizationId: string }>();
  const organizationId = Number(params.organizationId);

  const { data: organization, loading, error } = useLoad(
    () => getOrganization(organizationId),
    [organizationId]
  );

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
