import type { ReactNode } from "react";

type Props = {
  title: string;
  count: string;
  open: boolean;
  onToggle: () => void;
  /** 見出しの右に並べる操作。見出しのボタンの中には入れない(ボタンの入れ子になるため) */
  actions?: ReactNode;
  children: ReactNode;
};

/** スコアの月の枠。見出しを押すと中を閉じる・開く */
export default function LogGroup({ title, count, open, onToggle, actions, children }: Props) {
  return (
    <section className="LogGroup log-group">
      <div className="log-head-row">
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
        {actions}
      </div>
      {open && children}
    </section>
  );
}
