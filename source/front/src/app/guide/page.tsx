"use client";

import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import { useT } from "@/lib/text";

/** 使い方。インストールの仕方と、記録・見返しの流れ。API は叩かない */
export default function Page() {
  const T = useT();

  return (
    <div className="Guide page">
      <PageHeader title={T.guide.title} />
      {T.guide.sections.map((section) => (
        <section
          key={section.title}
          className="GuideSection panel"
        >
          <h2>{section.title}</h2>
          <ul className="guide-items">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <BackButton />
    </div>
  );
}
