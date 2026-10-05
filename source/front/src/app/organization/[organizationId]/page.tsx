"use client";

import AuthGate from "@/components/AuthGate";
import Header from "@/components/Header";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import {
  OrganizationRead,
  getOrganization,
  toErrorDetails,
  type ErrorDetails,
} from "@/lib/api";

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
    <AuthGate>
      <main className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Header pageName="組織情報" showBack />
        <div className="flex w-full flex-col gap-3 p-3 max-w-2xl mx-auto">
          {error && <ApiErrorAlert error={error} />}

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 text-center text-sm text-slate-500 shadow-sm">
              読み込み中...
            </div>
          )}

          {!loading && organization && (
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
              <div className="flex flex-col gap-1">
                <span className="text-xl font-bold text-slate-900">
                  {organization.name}
                </span>
                {organization.formal_name && (
                  <span className="text-sm text-slate-500">
                    {organization.formal_name}
                  </span>
                )}
              </div>

              {organization.description && (
                <span className="text-sm text-slate-700">
                  {organization.description}
                </span>
              )}

              {organization.location && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-slate-400">
                    所在
                  </span>
                  <span className="text-sm text-slate-700">
                    {organization.location}
                  </span>
                </div>
              )}

              {organization.homepage_url && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-slate-400">
                    ホームページ
                  </span>
                  <a
                    href={organization.homepage_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sm text-indigo-600 hover:underline break-all"
                  >
                    {organization.homepage_url}
                    <OpenInNewRoundedIcon fontSize="inherit" />
                  </a>
                </div>
              )}

              {organization.parent_organization && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-slate-400">
                    上位組織
                  </span>
                  <Link
                    href={`/organization/${organization.parent_organization.id}`}
                    className="text-sm text-indigo-600 hover:underline"
                  >
                    {organization.parent_organization.name}
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </AuthGate>
  );
}
