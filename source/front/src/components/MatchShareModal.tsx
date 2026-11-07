"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { matchPath } from "@/lib/score/match";
import { useT } from "@/lib/text";

type Props = {
  matchId: string;
  onClose: () => void;
};

// 「コピーしました」を出しておく時間
const COPIED_MS = 2000;
// QR の画像の一辺(px)。画面では CSS で縮める
const QR_SIZE_PX = 320;

/**
 * 試合に参加してもらうための QR・コード・コピーのボタンを出すモーダル。読み取ると試合の画面が開く。
 * 試合の画面と、記入画面の試合の印から開く
 */
export default function MatchShareModal({ matchId, onClose }: Props) {
  const T = useT();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<"url" | "code" | null>(null);

  // origin は画面に載ってからでないと読めない
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(`${window.location.origin}${matchPath(matchId)}`);
  }, [matchId]);

  useEffect(() => {
    if (url === null) return;
    let alive = true;
    QRCode.toDataURL(url, { width: QR_SIZE_PX, margin: 1 })
      .then((dataUrl) => {
        if (alive) setQr(dataUrl);
      })
      .catch(() => {
        // QR を作れなくても、コードとコピーで共有できる
        if (alive) setQr(null);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy(kind: "url" | "code") {
    const text = kind === "url" ? url : matchId;
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      // クリップボードに書けない(許可が無い・http で開いた)ときは、選んで写せるように出す
      window.prompt(T.match.share.prompt, text);
    }
  }

  return (
    <Modal
      title={T.match.share.open}
      onClose={onClose}
    >
      <div className="MatchShare match-share">
        {qr && (
          // 画面で作った data: の URL なので、next/image で縮める・配る意味が無い
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="MatchShareQr"
            src={qr}
            alt={T.match.share.qr}
            width={QR_SIZE_PX}
            height={QR_SIZE_PX}
          />
        )}
        <div className="stack tight">
          <span className="muted small">{T.match.share.code}</span>
          <span className="MatchShareCode match-code">{matchId}</span>
          <div className="action-row">
            <button
              type="button"
              className="MatchShareCopyCode"
              onClick={() => copy("code")}
            >
              {copied === "code" ? T.match.share.copied : T.match.share.copyCode}
            </button>
            <button
              type="button"
              className="MatchShareCopyUrl"
              disabled={url === null}
              onClick={() => copy("url")}
            >
              {copied === "url" ? T.match.share.copied : T.match.share.copyUrl}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
