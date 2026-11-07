"use client";

import Link from "next/link";
import type { MatchRead } from "@/lib/api";
import { formatDateTime } from "@/lib/formatDateTime";
import { useT } from "@/lib/text";

type Props = {
  match: MatchRead;
};

/** 試合の見出し(コード・日時・作った人)と、揃える矢の数 */
export default function MatchSummary({ match }: Props) {
  const T = useT();
  const total = match.end_size * match.round_size * match.game_size;
  const items = [
    {
      label: T.match.heldAt,
      value: formatDateTime(match.held_at),
    },
    {
      label: T.match.arrows,
      value: T.game.setup.summary(
        total,
        String(match.end_size),
        String(match.round_size),
        String(match.game_size),
      ),
    },
  ];

  return (
    <div className="MatchSummary panel stack tight">
      <div className="match-summary-head">
        <h2>{T.match.badge(match.id)}</h2>
        <span className="muted small">{T.match.gameCount(match.game_count)}</span>
      </div>
      {match.organizer && (
        <span className="small">
          <span className="muted">{T.match.organizer}: </span>
          {match.organizer.profile_visible ? (
            <Link href={`/profile/${match.organizer.id}`}>{match.organizer.name}</Link>
          ) : (
            match.organizer.name
          )}
        </span>
      )}
      <dl className="match-settings">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="muted">{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <span className="hint">{T.match.sharedNote}</span>
    </div>
  );
}
