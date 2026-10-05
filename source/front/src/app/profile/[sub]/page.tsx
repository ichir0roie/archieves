"use client";

import AuthGate from "@/components/AuthGate";
import Header from "@/components/Header";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import StatSummaryCard from "@/components/StatSummaryCard";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import {
  OrganizationRead,
  UserProfile,
  getOrganization,
  getUserProfile,
  toErrorDetails,
  type ErrorDetails,
} from "@/lib/api";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
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
    <AuthGate>
      <main className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Header pageName="プロフィール" showBack />
        <div className="flex w-full flex-col gap-3 p-3 max-w-2xl mx-auto">
          {error && <ApiErrorAlert error={error} />}

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 text-center text-sm text-slate-500 shadow-sm">
              読み込み中...
            </div>
          )}

          {!loading && profile && (
            <>
              <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-slate-900">
                    {profile.user.name}
                  </span>
                  {profile.user.nickname && (
                    <span className="text-sm text-slate-500">
                      ({profile.user.nickname})
                    </span>
                  )}
                </div>
                {organization && (
                  <Link
                    href={`/organization/${organization.id}`}
                    className="text-sm text-indigo-600 hover:underline w-fit"
                  >
                    {organization.name}
                  </Link>
                )}
                <span className="text-xs text-slate-400">
                  直近1年間の統計 ({formatDate(profile.period_start)} 〜{" "}
                  {formatDate(profile.period_end)})
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <StatSummaryCard title="ラウンド合計点" unit="点" stats={profile.rounds} />
                <StatSummaryCard title="エンド合計点" unit="点" stats={profile.ends} />
                <StatSummaryCard title="矢1本あたり" unit="点" stats={profile.points} />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-500">出場大会</span>
                {profile.matches.length === 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-center text-sm text-slate-400 shadow-sm">
                    直近1年間の大会記録はありません
                  </div>
                )}
                {profile.matches.map((match) => (
                  <div
                    key={match.id}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-base font-medium text-slate-800">
                        {match.name}
                      </span>
                      <span className="text-xs text-slate-400">
                        {formatDate(match.recorded_at)}
                      </span>
                    </div>
                    {match.link && (
                      <a
                        href={match.link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-sm text-indigo-600 hover:underline"
                      >
                        リンク
                        <OpenInNewRoundedIcon fontSize="inherit" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </AuthGate>
  );
}
