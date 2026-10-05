import type { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
};

/** 別のタブで開く外のリンク。開き先が外だと分かるよう、矢印を添える。 */
export default function ExternalLink({ href, children }: Props) {
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
