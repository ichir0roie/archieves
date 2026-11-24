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
  type ArrowColor,
  type EndPhotoRead,
} from "@/lib/api";
import { reanalyzeStoredPhoto } from "@/lib/photo/storedPhoto";
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
 * 送り終えたのに結果の無い写真(撮った画面で結果を書けずに離れた・API が写真を処理していたころに送った)は、
 * ここでも元の写真を端末で処理して結果を書く
 */
function GamePhotosContent() {
  const T = useT();
  const gameId = useSearchParams().get("gameId");

  const loaded = useLoad(async (): Promise<{ items: PhotoItem[]; nockColor: string | null; fletchColor: ArrowColor | null }> => {
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
    const items = photos.flatMap((photo) => {
      const position = numbers.get(photo.end_id);
      return position ? [{ photo, ...position }] : [];
    });
    return { items, nockColor: sheet.nock_color, fletchColor: sheet.fletch_color };
  }, [gameId]);

  const [processed, setProcessed] = useState<Record<number, EndPhotoRead>>({});
  // StrictMode で effect が二度走っても、同じ写真を二度処理しない
  const requested = useRef(new Set<number>());
  useEffect(() => {
    const data = loaded.data;
    if (!data) return;
    for (const { photo } of data.items) {
      if (photo.status !== "uploading" || requested.current.has(photo.id)) continue;
      requested.current.add(photo.id);
      reanalyzeStoredPhoto(photo, { nockColor: data.nockColor, fletchColor: data.fletchColor, alignment: null }).then(
        (result) => setProcessed((current) => ({ ...current, [result.id]: result })),
        () => {
          // 置き場に届いていない・読めない写真・電波が無い。次に開いたときにまた試す
        },
      );
    }
  }, [loaded.data]);

  return (
    <div className="page wide">
      <PageHeader title={T.profile.scoreView.photosTitle} />
      {loaded.error && <ApiErrorAlert error={loaded.error} />}
      {loaded.loading && !loaded.data && <p className="status empty">{T.loading}</p>}
      {loaded.data && loaded.data.items.length === 0 && (
        <p className="status empty">{T.profile.scoreView.noPhotos}</p>
      )}
      {loaded.data && loaded.data.items.length > 0 && (
        <div className="GamePhotoList photo-grid">
          {loaded.data.items.map(({ photo: listed, roundNumber, endNumber }) => {
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
