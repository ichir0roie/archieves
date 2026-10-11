"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import StatSummaryCard from "@/components/StatSummaryCard";
import VisibilitySettings from "@/components/VisibilitySettings";
import { useLoad } from "@/hooks/useLoad";
import {
  getOrganization,
  getUserProfile,
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

  const loaded = useLoad(async () => {
    const profile = await getUserProfile(sub);
    const organization =
      profile.user.organization_id === null
        ? null
        : await getOrganization(profile.user.organization_id);
    return { profile, organization };
  }, [sub]);
  // 本人に公開されていないプロフィールは API が 403 を返す。壊れたのではないので、エラーにせず知らせる
  const isPrivate = loaded.error?.status === 403;
  const error = isPrivate ? null : loaded.error;
  // 別の人のプロフィールへ移って読み直している間・読めなかったときは、前の人のものを出さない
  const profile = loaded.loading || loaded.error ? null : loaded.data?.profile ?? null;
  const organization = loaded.data?.organization ?? null;

  return (
    <div className="page wide">
      <PageHeader title={T.profile.view.title} />
      {error && <ApiErrorAlert error={error} />}

      {loaded.loading && <p className="status empty">{T.loading}</p>}

      {!loaded.loading && isPrivate && <p className="ProfilePrivate status empty">{T.profile.view.private}</p>}

      {profile && (
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
