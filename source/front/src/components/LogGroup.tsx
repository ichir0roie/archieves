import type { ReactNode } from "react";

type Props = {
  level: "year" | "month" | "day";
  title: string;
  count: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/** スコアの年・月・日の見出し。押すと中を閉じる・開く */
export default function LogGroup({ level, title, count, open, onToggle, children }: Props) {
  return (
    <section className={`LogGroup log-group log-${level}`}>
      <button
        type="button"
        className="log-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span
          className="log-arrow"
          aria-hidden="true"
        >
          {open ? "▼" : "▶"}
        </span>
        <span className="log-title">{title}</span>
        <span className="muted small">{count}</span>
      </button>
      {open && <div className="log-body">{children}</div>}
    </section>
  );
}
