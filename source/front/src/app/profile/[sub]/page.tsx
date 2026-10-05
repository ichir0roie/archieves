"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import ExternalLink from "@/components/ExternalLink";
import PageHeader from "@/components/PageHeader";
import StatSummaryCard from "@/components/StatSummaryCard";
import {
  OrganizationRead,
  UserProfile,
  getOrganization,
  getUserProfile,
  toErrorDetails,
  type ErrorDetails,
} from "@/lib/api";
import { T } from "@/lib/text";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return T.none;
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(date);
}

export default function Page() {
  const params = useParams<{ sub: string }>();
  const sub = params.sub;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<OrganizationRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorDetails | null>(null);

  useEffect(() => {
    if (!sub) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getUserProfile(sub);
        if (cancelled) return;
        setProfile(data);
        if (data.user.organization_id !== null) {
          const org = await getOrganization(data.user.organization_id);
          if (!cancelled) setOrganization(org);
        } else {
          setOrganization(null);
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
  }, [sub]);

  return (
    <div className="page wide">
      <PageHeader title={T.profile.view.title} />
      {error && <ApiErrorAlert error={error} />}

      {loading && <p className="status empty">{T.loading}</p>}

      {!loading && profile && (
        <>
          <section className="panel profile-card">
            <div className="row">
              <span className="profile-name">{profile.user.name}</span>
              {profile.user.nickname && (
                <span className="muted small">{T.profile.view.nickname(profile.user.nickname)}</span>
              )}
            </div>
            {organization && <Link href={`/organization/${organization.id}`}>{organization.name}</Link>}
            <span className="muted small">
              {T.profile.view.period(formatDate(profile.period_start), formatDate(profile.period_end))}
            </span>
          </section>

          <div className="cards">
            <StatSummaryCard
              title={T.stats.card.round}
              unit={T.unit.point}
              stats={profile.rounds}
            />
            <StatSummaryCard
              title={T.stats.card.end}
              unit={T.unit.point}
              stats={profile.ends}
            />
            <StatSummaryCard
              title={T.stats.card.point}
              unit={T.unit.point}
              stats={profile.points}
            />
          </div>

          <span className="section-label">{T.profile.view.matches}</span>
          {profile.matches.length === 0 ? (
            <p className="status empty">{T.profile.view.noMatches}</p>
          ) : (
            <div className="row-list">
              {profile.matches.map((match) => (
                <div key={match.id}>
                  <div className="main">
                    <span>{match.name}</span>
                    <span className="muted small">{formatDate(match.recorded_at)}</span>
                  </div>
                  {match.link && <ExternalLink href={match.link}>{T.profile.link}</ExternalLink>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
