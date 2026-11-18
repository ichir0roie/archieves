/**
 * 写真モードで撮った写真を、送り終えるまで端末(IndexedDB)に置く。
 *
 * 撮ったあとすぐ画面を閉じると、スマホはページの通信を止める。送っている途中の写真を失わないよう、
 * 撮ったらまずここに置き、送れて処理を頼めたら消す。localStorage は数 MB で写真が入らないので使わない。
 * IndexedDB を開けない(プライベートブラウズなど)ときは、画面を開いている間だけメモリに置く。
 */

/**
 * 送る写真の大きさの上限(app/core/photos.py の PHOTO_MAX_BYTES と揃える)。超える写真は API が
 * 受け付けで弾き、送り直しても通らないので、撮ったときに断る
 */
export const PHOTO_MAX_BYTES = 30 * 1024 * 1024;

/** 送る写真の形式。API が受けるもの(app/core/photos.py の PHOTO_EXTENSIONS) */
export type PhotoContentType = "image/jpeg" | "image/png" | "image/webp";

export interface QueuedPhoto {
  id: string;
  /** 撮った人(ログインの sub) */
  sub: string;
  /** どのゲームの写真か(ScoreManager.photoQueueKey) */
  gameKey: string;
  /** 撮ったエンドの位置。送るときに、保存したエンドの id を引く */
  roundIndex: number;
  endIndex: number;
  blob: Blob;
  contentType: PhotoContentType;
  takenAt: string;
  /** 置き場へ送り終えた写真の id。処理を頼み損ねたら、送り直さずに頼み直す */
  uploadedPhotoId: number | null;
}

const DB_NAME = "archieves-photos";
const STORE = "queuedPhotos";

let opening: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, QueuedPhoto>();

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putQueuedPhoto(photo: QueuedPhoto): Promise<void> {
  const db = await open();
  if (db === null) {
    memory.set(photo.id, photo);
    return;
  }
  await run(db, "readwrite", (store) => store.put(photo));
}

export async function deleteQueuedPhoto(id: string): Promise<void> {
  const db = await open();
  if (db === null) {
    memory.delete(id);
    return;
  }
  await run(db, "readwrite", (store) => store.delete(id));
}

/** その人のそのゲームの、送り終えていない写真。撮った順 */
export async function listQueuedPhotos(sub: string, gameKey: string): Promise<QueuedPhoto[]> {
  const db = await open();
  const all = db === null ? [...memory.values()] : await run(db, "readonly", (store) => store.getAll());
  return (all as QueuedPhoto[])
    .filter((photo) => photo.sub === sub && photo.gameKey === gameKey)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

const SUPPORTED_TYPES: ReadonlyArray<PhotoContentType> = ["image/jpeg", "image/png", "image/webp"];

/**
 * 撮った写真を、API が受ける形式にする。HEIC などは JPEG に描き直す(画素は縮めない)。
 * 描き直せなければ null
 */
export async function toUploadable(
  file: Blob,
): Promise<{ blob: Blob; contentType: PhotoContentType } | null> {
  const type = SUPPORTED_TYPES.find((supported) => supported === file.type);
  if (type) return { blob: file, contentType: type };
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    return blob ? { blob, contentType: "image/jpeg" } : null;
  } catch {
    return null;
  }
}
