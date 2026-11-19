/**
 * 矢の写真から、ノックの色を測る(矢の色の登録の画面、NockColorRegistration)。
 *
 * 押した所のまわりの小さな四角の画素から色を取る。ノックの縁には軸・羽根・背景が混じるので、
 * 四角のうち鮮やかな方の半分だけを平均する(蛍光のノックは、まわりより彩度が高い)。
 * 何本かの矢のノックを押してもらい、それらを平均して登録の色にする。測った色は API が
 * 探す色の幅に直す(app/services/arrow_detection.py の nock_ranges)。
 */

export type Rgb = { r: number; g: number; b: number };

/** 色を測る画像の長辺(px)。押した所の色だけを使うので、元の写真の大きさは要らない */
export const SAMPLE_IMAGE_MAX_PX = 1600;
/** 押した所から取る四角の半分の幅(画像の長辺に対する割合)。ノックが写る大きさの半分ほど */
const PATCH_RATIO = 0.004;

function saturation({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

/** 画像の (x, y)(px)のまわりの色。四角が画像の外なら null */
export function sampleColor(image: ImageData, x: number, y: number): Rgb | null {
  const half = Math.max(2, Math.round(Math.max(image.width, image.height) * PATCH_RATIO));
  const pixels: Array<Rgb> = [];
  for (let py = Math.round(y) - half; py <= Math.round(y) + half; py++) {
    for (let px = Math.round(x) - half; px <= Math.round(x) + half; px++) {
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
      const i = (py * image.width + px) * 4;
      pixels.push({
        r: image.data[i],
        g: image.data[i + 1],
        b: image.data[i + 2],
      });
    }
  }
  if (pixels.length === 0) return null;
  const vivid = [...pixels]
    .sort((a, b) => saturation(b) - saturation(a))
    .slice(0, Math.max(1, Math.ceil(pixels.length / 2)));
  return averageColor(vivid);
}

export function averageColor(colors: ReadonlyArray<Rgb>): Rgb {
  const sum = colors.reduce(
    (total, color) => ({
      r: total.r + color.r,
      g: total.g + color.g,
      b: total.b + color.b,
    }),
    {
      r: 0,
      g: 0,
      b: 0,
    },
  );
  const n = Math.max(1, colors.length);
  return {
    r: Math.round(sum.r / n),
    g: Math.round(sum.g / n),
    b: Math.round(sum.b / n),
  };
}

/** #rrggbb(小文字)。API が受けるノックの色の形 */
export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/** 写真のファイルを、色を測るための画素にする(向きは EXIF のとおりに直る) */
export async function loadSampleImage(file: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, SAMPLE_IMAGE_MAX_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("canvas 2d is unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
}
