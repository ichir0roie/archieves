"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { matchIdFromQr } from "@/lib/score/match";
import { useT } from "@/lib/text";

type Props = {
  onClose: () => void;
  /** 試合の QR を読めたら、その試合の id を渡す(カメラはもう止めてある) */
  onFound: (matchId: string) => void;
};

type Status = "starting" | "scanning" | "denied" | "unsupported";

// 読み取りの間隔。毎フレーム読むと電池を食うので間を空ける
const SCAN_INTERVAL_MS = 150;
// 読み取りに使う画像の幅の上限。大きいほど遅く、QR を読むには 640px で足りる
const SCAN_MAX_WIDTH_PX = 640;

/**
 * カメラを起こして試合の QR を読むモーダル。ホーム画面に入れたアプリ(特に iPhone)は、カメラや LINE で
 * 読んだ URL を受け取れず Safari などで開いてしまうので、アプリの中で読めるようにする。
 * BarcodeDetector は iPhone の Safari に無いので、映像のコマを jsQR で読む
 */
export default function MatchQrScanner({ onClose, onFound }: Props) {
  const T = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [notMatch, setNotMatch] = useState(false);
  // 読めたときに呼ぶ関数は描き直しで変わるが、カメラは起こし直さない
  const found = useRef(onFound);
  useEffect(() => {
    found.current = onFound;
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    function stopCamera() {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    }

    function scan() {
      if (stopped) return;
      const video = videoRef.current;
      if (video && context && video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        const scale = Math.min(1, SCAN_MAX_WIDTH_PX / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
        if (code) {
          const matchId = matchIdFromQr(code.data);
          if (matchId !== null) {
            stopCamera();
            found.current(matchId);
            return;
          }
          // ほかの QR が映っている。知らせて読み続ける
          setNotMatch(true);
        }
      }
      timer = setTimeout(scan, SCAN_INTERVAL_MS);
    }

    async function start() {
      // http で開いた・カメラの無い端末では mediaDevices が無い
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (e) {
        setStatus(e instanceof DOMException && e.name === "NotAllowedError" ? "denied" : "unsupported");
        return;
      }
      // 許可を待つ間にモーダルを閉じた
      if (stopped || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      // iPhone は muted・playsInline でないと自動で再生しない。再生できなくても、コマが来れば読める
      await videoRef.current.play().catch(() => undefined);
      setStatus("scanning");
      scan();
    }

    start();
    return stopCamera;
  }, []);

  return (
    <Modal
      title={T.match.scan.title}
      onClose={onClose}
      actions={
        <button
          type="button"
          onClick={onClose}
        >
          {T.cancel}
        </button>
      }
    >
      <div className="MatchQrScanner stack">
        {(status === "starting" || status === "scanning") && (
          <div className="qr-scanner">
            <video
              ref={videoRef}
              className="MatchQrScannerVideo"
              muted
              playsInline
              autoPlay
            />
            <div
              className="qr-scanner-frame"
              aria-hidden="true"
            />
          </div>
        )}
        {status === "starting" && <p className="status empty">{T.match.scan.starting}</p>}
        {status === "scanning" && <p className="hint">{T.match.scan.hint}</p>}
        {notMatch && status === "scanning" && (
          <p className="MatchQrScannerNotMatch status error">{T.match.scan.notMatch}</p>
        )}
        {status === "denied" && <p className="MatchQrScannerDenied status error">{T.match.scan.denied}</p>}
        {status === "unsupported" && (
          <p className="MatchQrScannerUnsupported status error">{T.match.scan.unsupported}</p>
        )}
      </div>
    </Modal>
  );
}
