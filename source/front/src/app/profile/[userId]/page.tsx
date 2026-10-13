"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import DiaryCell from "@/components/DiaryCell";
import PageHeader from "@/components/PageHeader";
import StatSummaryCard from "@/components/StatSummaryCard";
import { useLoad } from "@/hooks/useLoad";
import {
  getOrganization,
  getUserProfile,
} from "@/lib/api";
import { getCurrentAppUser } from "@/lib/auth/currentUser";
import { formatDateTime } from "@/lib/formatDateTime";
import { scoreSharePath } from "@/lib/scoreShare";
import { useT, type Texts } from "@/lib/text";

function formatDate(T: Texts, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return T.none;
  return new Intl.DateTimeFormat(T.intlLocale, { dateStyle: "medium" }).format(date);
}

export default function Page() {
  const T = useT();
  const params = useParams<{ userId: string }>();
  const userId = Number(params.userId);
  // 前は sub を URL にしていた。そのころのブックマークなど、数でない URL は無いページにする
  if (!Number.isSafeInteger(userId)) notFound();
  const currentUser = useLoad(() => getCurrentAppUser(), []);
  const isMe = currentUser.data?.id === userId;

  const loaded = useLoad(async () => {
    const profile = await getUserProfile(userId);
    const organization =
      profile.user.organization_id === null
        ? null
        : await getOrganization(profile.user.organization_id);
    return { profile, organization };
  }, [userId]);
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
              {profile.period_start && profile.period_end
                ? T.profile.view.period(
                    profile.game_count,
                    formatDate(T, profile.period_start),
                    formatDate(T, profile.period_end),
                  )
                : T.profile.view.noGames}
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

          {/* スコア・日記は、持ち主の公開範囲が見せないとき API が null を返す。そのときは欄ごと出さない */}
          {profile.recent_games && (
            <section className="ProfileRecentScores panel stack tight">
              <h2>{T.profile.view.recentScores}</h2>
              {profile.recent_games.length === 0 ? (
                <p className="status empty">{T.profile.view.noGames}</p>
              ) : (
                profile.recent_games.map((game) => (
                  <Link
                    key={game.game_id}
                    href={scoreSharePath([game.game_id])}
                  >
                    {T.profile.view.scoreLink(
                      formatDate(T, game.recorded_at),
                      game.total_score,
                      game.arrow_count,
                    )}
                  </Link>
                ))
              )}
            </section>
          )}

          {profile.recent_diaries && (
            <section className="ProfileRecentDiaries stack tight">
              <span className="section-label">{T.profile.view.recentDiaries}</span>
              {profile.recent_diaries.length === 0 ? (
                <p className="status empty">{T.profile.view.noDiaries}</p>
              ) : (
                <div className="DiaryCells">
                  {profile.recent_diaries.map((diary) => (
                    <DiaryCell
                      key={diary.id}
                      diary={diary}
                      date={formatDateTime(diary.created_at)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {isMe && (
            <Link
              className="ProfileSettingsLink"
              href="/profile/settings"
            >
              {T.profile.view.toSettings}
            </Link>
          )}
        </>
      )}
      <BackButton />
    </div>
  );
}
