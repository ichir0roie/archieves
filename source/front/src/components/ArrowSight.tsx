import type { CSSProperties } from "react";

/** 記入画面で押しているあいだ指の上に出すズームの倍率。サイトもこの倍率で描く */
export const LENS_ZOOM = 2.5;

type Props = {
  /** 矢として扱う円の直径(画面の px)。サイトはこれをズームの倍率で描く */
  arrowDiameterPx: number;
  /** 下にある帯の色のクラス(ringClass)。十字はその反転色で描く(帯に埋もれないように) */
  ringClassName: string;
};

/**
 * 狙う点に出すサイト(十字と円)。円の大きさは矢の太さで、円が帯の線にかかれば高い方の点数になる。
 * 記入画面のズームと、設定画面のプレビューの両方で使い、同じ大きさに描く。
 */
export default function ArrowSight({ arrowDiameterPx, ringClassName }: Props) {
  return (
    <div
      className={`ArrowSight lens-crosshair ${ringClassName}`}
      style={{ "--arrow-size": `${arrowDiameterPx * LENS_ZOOM}px` } as CSSProperties}
    />
  );
}
