import { useT } from "@/lib/text";

type Props = {
  year: number;
  /** 前(古い)の年。無ければ ◀ を押せない */
  older: number | null;
  /** 次(新しい)の年。無ければ ▶ を押せない */
  newer: number | null;
  onChange: (year: number) => void;
};

/** ◀ yyyy ▶ で年を移る */
export default function YearSwitcher({ year, older, newer, onChange }: Props) {
  const T = useT();
  return (
    <div className="YearSwitcher year-switcher">
      <button
        type="button"
        className="ghost"
        aria-label={T.profile.scoreLog.olderYear}
        disabled={older === null}
        onClick={() => older !== null && onChange(older)}
      >
        ◀
      </button>
      <span className="year-switcher-year">{T.profile.scoreLog.year(String(year))}</span>
      <button
        type="button"
        className="ghost"
        aria-label={T.profile.scoreLog.newerYear}
        disabled={newer === null}
        onClick={() => newer !== null && onChange(newer)}
      >
        ▶
      </button>
    </div>
  );
}
