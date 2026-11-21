"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ApiErrorAlert from "@/components/ApiErrorAlert";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/PageHeader";
import {
  getGameSheet,
  listGamePhotos,
  photoFileUrl,
  processPhoto,
  type EndPhotoRead,
} from "@/lib/api";
import { useLoad } from "@/hooks/useLoad";
import { useT } from "@/lib/text";

export default function Page() {
  const T = useT();
  return (
    <Suspense
      fallback={
        <div className="page">
          <p className="status empty">{T.loading}</p>
        </div>
      }
    >
      <GamePhotosContent />
    </Suspense>
  );
}

type PhotoItem = {
  photo: EndPhotoRead;
  roundNumber: number;
  endNumber: number;
};

/**
 * ゲームの元の写真の一覧(写真モードで撮ったもの)。並びはラウンド・エンドの順。
 * 一覧には表示の画像を出し、押すと元の写真を別のタブで開く。
 * 送り終えたのに処理の済んでいない写真(撮った画面で処理に失敗し、そのまま離れた)は、ここでも処理を頼む
 */
function GamePhotosContent() {
  const T = useT();
  const gameId = useSearchParams().get("gameId");

  const loaded = useLoad(async (): Promise<PhotoItem[]> => {
    if (!gameId) throw new Error(T.profile.scoreView.noGame);
    const [sheet, photos] = await Promise.all([
      getGameSheet(Number(gameId)),
      listGamePhotos(Number(gameId)),
    ]);
    const numbers = new Map<number, { roundNumber: number; endNumber: number }>();
    for (const round of sheet.rounds) {
      for (const end of round.ends) {
        numbers.set(end.id, { roundNumber: round.number, endNumber: end.number });
      }
    }
    return photos.flatMap((photo) => {
      const position = numbers.get(photo.end_id);
      return position ? [{ photo, ...position }] : [];
    });
  }, [gameId]);

  const [processed, setProcessed] = useState<Record<number, EndPhotoRead>>({});
  // StrictMode で effect が二度走っても、同じ写真の処理を二度頼まない
  const requested = useRef(new Set<number>());
  useEffect(() => {
    for (const { photo } of loaded.data ?? []) {
      if (photo.status !== "uploading" || requested.current.has(photo.id)) continue;
      requested.current.add(photo.id);
      processPhoto(photo.id).then(
        (result) => setProcessed((current) => ({ ...current, [result.id]: result })),
        () => {
          // 置き場に届いていない(409)・処理に失敗した。次に開いたときにまた頼む
        },
      );
    }
  }, [loaded.data]);

  return (
    <div className="page wide">
      <PageHeader title={T.profile.scoreView.photosTitle} />
      {loaded.error && <ApiErrorAlert error={loaded.error} />}
      {loaded.loading && !loaded.data && <p className="status empty">{T.loading}</p>}
      {loaded.data && loaded.data.length === 0 && (
        <p className="status empty">{T.profile.scoreView.noPhotos}</p>
      )}
      {loaded.data && loaded.data.length > 0 && (
        <div className="GamePhotoList photo-grid">
          {loaded.data.map(({ photo: listed, roundNumber, endNumber }) => {
            const photo = processed[listed.id] ?? listed;
            return (
              <a
                key={photo.id}
                className="GamePhoto photo-card panel"
                href={photoFileUrl(photo.original_url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {photo.display_url ? (
                  // 署名付き URL は next/image の最適化に通せないので、そのまま出す
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoFileUrl(photo.display_url)}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="photo-card-empty muted small">
                    {T.profile.scoreView.photoNotProcessed}
                  </span>
                )}
                <span className="small">{T.profile.scoreView.photoCaption(roundNumber, endNumber)}</span>
              </a>
            );
          })}
        </div>
      )}
      <BackButton />
    </div>
  );
}
