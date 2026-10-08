import type { ReactNode } from "react";

type Props = {
  title: string;
  count: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/** スコアの月の枠。見出しを押すと中を閉じる・開く */
export default function LogGroup({ title, count, open, onToggle, children }: Props) {
  return (
    <section className="LogGroup log-group">
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
      {open && children}
    </section>
  );
}
