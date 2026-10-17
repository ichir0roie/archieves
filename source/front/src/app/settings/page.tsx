"use client";

import Link from "next/link";
import AccessTokens from "@/components/AccessTokens";
import AccountDeletion from "@/components/AccountDeletion";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import ExportFileImport from "@/components/ExportFileImport";
import LegalLinks from "@/components/LegalLinks";
import RecordsExport from "@/components/RecordsExport";
import {
  MENU_POSITIONS,
  saveMenuPosition,
  useMenuPosition,
  type MenuPosition,
} from "@/lib/menuPosition";
import { LOCALES, saveLocale, useLocale, useT } from "@/lib/text";

export default function Page() {
  const T = useT();
  const position = useMenuPosition();
  const locale = useLocale();
  const POSITION_LABELS: Record<MenuPosition, string> = {
    "top-left": T.settings.menuPosition.topLeft,
    "top-right": T.settings.menuPosition.topRight,
    "bottom-left": T.settings.menuPosition.bottomLeft,
    "bottom-right": T.settings.menuPosition.bottomRight,
  };

  return (
    <div className="page">
      <PageHeader title={T.settings.title} />

      <section className="panel stack">
        <h2>{T.settings.menuPosition.title}</h2>
        <p className="muted small">{T.settings.menuPosition.description}</p>
        <div
          className="toolbar"
          role="group"
          aria-label={T.settings.menuPosition.groupLabel}
        >
          {MENU_POSITIONS.map((key) => (
            <button
              key={key}
              type="button"
              className={position === key ? "primary" : undefined}
              aria-pressed={position === key}
              onClick={() => saveMenuPosition(key)}
            >
              {POSITION_LABELS[key]}
            </button>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <h2>{T.settings.language.title}</h2>
        <p className="muted small">{T.settings.language.description}</p>
        <div
          className="toolbar"
          role="group"
          aria-label={T.settings.language.groupLabel}
        >
          {LOCALES.map((key) => (
            <button
              key={key}
              type="button"
              className={locale === key ? "primary" : undefined}
              aria-pressed={locale === key}
              onClick={() => saveLocale(key)}
            >
              {T.settings.language[key]}
            </button>
          ))}
        </div>
      </section>

      <section className="panel stack tight">
        <h2>{T.settings.links.title}</h2>
        <Link href="/profile/settings">{T.settings.links.profileSettings}</Link>
      </section>

      <section className="panel stack tight">
        <h2>{T.legal.title}</h2>
        <LegalLinks withLicense />
      </section>

      <ExportFileImport />

      <RecordsExport />

      <AccessTokens />

      <AccountDeletion />
      <BackButton />
    </div>
  );
}
