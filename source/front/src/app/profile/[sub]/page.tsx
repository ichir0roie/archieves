"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import StatSummaryCard from "@/components/StatSummaryCard";
import VisibilitySettings from "@/components/VisibilitySettings";
import { useLoad } from "@/hooks/useLoad";
import {
  ApiError,
  OrganizationRead,
  UserProfile,
  getOrganization,
  getUserProfile,
  toErrorDetails,
  type ErrorDetails,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/currentUser";
import { useT, type Texts } from "@/lib/text";

function formatDate(T: Texts, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return T.none;
  return new Intl.DateTimeFormat(T.intlLocale, { dateStyle: "medium" }).format(date);
}

export default function Page() {
  const T = useT();
  const params = useParams<{ sub: string }>();
  const sub = params.sub;
  const currentUser = useLoad(() => getCurrentUser(), []);
  const isMe = currentUser.data?.userId === sub;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<OrganizationRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorDetails | null>(null);
  // 本人に公開されていないプロフィールは API が 403 を返す。壊れたのではないので、エラーにせず知らせる
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    if (!sub) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setIsPrivate(false);
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
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 403) setIsPrivate(true);
        else setError(toErrorDetails(e));
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

      {!loading && isPrivate && <p className="ProfilePrivate status empty">{T.profile.view.private}</p>}

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
              {T.profile.view.period(formatDate(T, profile.period_start), formatDate(T, profile.period_end))}
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

          {isMe && <VisibilitySettings />}
        </>
      )}
      <BackButton />
    </div>
  );
}
