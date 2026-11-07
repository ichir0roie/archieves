"use client";

import Link from "next/link";
import { useState } from "react";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import MatchInfoModal from "@/components/MatchInfoModal";
import Modal from "@/components/Modal";
import {
  deleteMatch,
  toErrorDetails,
  updateMatch,
  type ErrorDetails,
  type MatchRead,
} from "@/lib/api";
import { formatDateTime } from "@/lib/formatDateTime";
import { matchArrowSummary, matchTitle } from "@/lib/score/match";
import { useT } from "@/lib/text";

type Props = {
  match: MatchRead;
  /** 渡すと、作った人にタイトル・内容の編集を出す。直した試合を受け取る */
  onUpdated?: (match: MatchRead) => void;
  /** 渡すと、作った人に削除を出す。消したあとに呼ぶ(呼ぶ側は一覧などへ移る) */
  onDeleted?: () => void;
  /** 見出し(タイトル・コード・日時)だけにする。数を別の区画に出す参加の設定の画面で使う */
  compact?: boolean;
  /** タイトルを画面の見出しに出しているので、ここでは繰り返さない(試合の画面) */
  titleInHeader?: boolean;
};

type DeleteProps = {
  match: MatchRead;
  onClose: () => void;
  onDeleted: () => void;
};

/** 試合の削除を確かめるモーダル。参加した人のゲームがどうなるかを書いてから消す */
function MatchDeleteModal({ match, onClose, onDeleted }: DeleteProps) {
  const T = useT();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);

  async function remove() {
    setSending(true);
    setError(null);
    try {
      await deleteMatch(match.id);
      onDeleted();
    } catch (e) {
      setError(toErrorDetails(e));
      setSending(false);
    }
  }

  return (
    <Modal
      title={T.match.info.deleteTitle}
      onClose={onClose}
      actions={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
          >
            {T.cancel}
          </button>
          <button
            type="button"
            className="MatchDeleteConfirm danger"
            onClick={remove}
            disabled={sending}
          >
            {T.delete}
          </button>
        </>
      }
    >
      {error && <ApiErrorAlert error={error} />}
      <p>{T.match.info.deleteConfirm(matchTitle(T, match))}</p>
    </Modal>
  );
}

/** 試合の見出し(タイトル・コード・日時・作った人)と内容、揃える矢の数 */
export default function MatchSummary({
  match,
  onUpdated,
  onDeleted,
  compact = false,
  titleInHeader = false,
}: Props) {
  const T = useT();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const items = [
    {
      label: T.match.heldAt,
      value: formatDateTime(match.held_at),
    },
    ...(compact
      ? []
      : [
          {
            label: T.match.arrows,
            value: matchArrowSummary(T, match),
          },
        ]),
  ];

  return (
    <div className="MatchSummary panel stack tight">
      <div className="match-summary-head">
        {titleInHeader ? (
          <span className="MatchSummaryCode muted small">{T.match.badge(match.id)}</span>
        ) : (
          <h2>{matchTitle(T, match)}</h2>
        )}
        {!compact && <span className="muted small">{T.match.gameCount(match.game_count)}</span>}
      </div>
      {/* タイトルを付けた試合でも、共有・参加に使うコードは見せる */}
      {match.title && !titleInHeader && (
        <span className="MatchSummaryCode muted small">{T.match.badge(match.id)}</span>
      )}
      {!compact && match.organizer && (
        <span className="small">
          <span className="muted">{T.match.organizer}: </span>
          {match.organizer.profile_visible ? (
            <Link href={`/profile/${match.organizer.id}`}>{match.organizer.name}</Link>
          ) : (
            match.organizer.name
          )}
        </span>
      )}
      {!compact && match.description && <p className="MatchSummaryDescription match-description">{match.description}</p>}
      <dl className="match-settings">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="muted">{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      {match.organized_by_me && (onUpdated || onDeleted) && (
        <div className="match-summary-actions action-row">
          {onUpdated && (
            <button
              type="button"
              className="MatchEdit"
              onClick={() => setEditing(true)}
            >
              {T.match.info.edit}
            </button>
          )}
          {onDeleted && (
            <button
              type="button"
              className="MatchDelete"
              onClick={() => setDeleting(true)}
            >
              {T.match.info.delete}
            </button>
          )}
        </div>
      )}
      {deleting && onDeleted && (
        <MatchDeleteModal
          match={match}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
        />
      )}
      {editing && (
        <MatchInfoModal
          title={T.match.info.editTitle}
          submitLabel={T.save}
          initial={{
            title: match.title ?? "",
            description: match.description ?? "",
          }}
          onClose={() => setEditing(false)}
          onSubmit={async (info) => {
            const updated = await updateMatch(match.id, info);
            setEditing(false);
            onUpdated?.(updated);
          }}
        />
      )}
    </div>
  );
}
