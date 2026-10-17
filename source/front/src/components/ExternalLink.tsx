import type { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
};

/** http・https の URL か。だれでも入れられる値(組織のホームページなど)を、javascript: などのリンクにしない */
function isHttpUrl(href: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

/** 別のタブで開く外のリンク。開き先が外だと分かるよう、矢印を添える。http・https 以外はリンクにせず文字で出す。 */
export default function ExternalLink({ href, children }: Props) {
  if (!isHttpUrl(href)) return <span>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="external-link"
    >
      {children}
      <span aria-hidden="true">↗</span>
    </a>
  );
}
