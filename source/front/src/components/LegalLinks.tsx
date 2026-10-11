"use client";

import { legalLinks } from "@/lib/legalLinks";
import { useLocale, useT } from "@/lib/text";

type Props = {
  /** ライセンスへのリンクも並べる(サインインの画面では出さない) */
  withLicense?: boolean;
};

/** 利用規約・プライバシーポリシー(・ライセンス)への外部リンク。GitHub を別のタブで開く */
export default function LegalLinks({ withLicense }: Props) {
  const T = useT();
  const links = legalLinks(useLocale());
  const items = [
    { href: links.termsOfService, label: T.legal.termsOfService },
    { href: links.privacyPolicy, label: T.legal.privacyPolicy },
    ...(withLicense ? [{ href: links.license, label: T.legal.license }] : []),
  ];
  return (
    <>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {item.label}
        </a>
      ))}
    </>
  );
}
