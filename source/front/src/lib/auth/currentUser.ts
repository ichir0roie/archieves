import { getCurrentUser as amplifyGetCurrentUser } from "aws-amplify/auth";
import { ensureCurrentUser, getMyUser, type MeRead } from "@/lib/api";
import {
  loadCachedAppUser,
  saveCachedAppUser,
  type CachedAppUser,
} from "@/lib/storage";
import { isMockAuth } from "./config";
import { MOCK_USER } from "./mockUser";

interface CurrentUser {
  userId: string;
  username: string;
  email: string;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  if (isMockAuth()) {
    return { userId: MOCK_USER.sub, username: MOCK_USER.username, email: MOCK_USER.email };
  }
  const user = await amplifyGetCurrentUser();
  return {
    userId: user.userId,
    username: user.username,
    email: user.signInDetails?.loginId ?? user.username,
  };
}

function cacheAppUser(sub: string, user: MeRead): CachedAppUser {
  const cached = {
    sub,
    id: user.id,
    name: user.name,
    isAdmin: user.is_admin,
  };
  saveCachedAppUser(cached);
  return cached;
}

/** キャッシュにある今の利用者。API は叩かない。無ければ null */
export async function getCachedAppUser(): Promise<CachedAppUser | null> {
  const { userId } = await getCurrentUser();
  return loadCachedAppUser(userId);
}

/** 今の利用者の id。キャッシュに無いときだけ API で用意する(行が無ければ作る) */
export async function getCurrentAppUser(): Promise<CachedAppUser> {
  const cached = await getCachedAppUser();
  if (cached) return cached;
  return (await refreshCurrentAppUser()).cached;
}

/**
 * API から今の利用者を読み直してキャッシュに書く(行が無ければ作る)。管理者のフラグは db を直に
 * 書き換えて決めるので、キャッシュはここ(プロフィールの設定を開いたとき)でだけ新しくなる
 */
export async function refreshCurrentAppUser(): Promise<{ user: MeRead; cached: CachedAppUser }> {
  const { userId, email } = await getCurrentUser();
  const user = await ensureCurrentUser({ name: email });
  return { user, cached: cacheAppUser(userId, user) };
}

/** 名前を変えたあとなど、API の応答で分かった値をキャッシュに当てる */
export async function updateCachedAppUser(user: Pick<MeRead, "id" | "name">): Promise<void> {
  const cached = await getCachedAppUser();
  if (!cached || cached.id !== user.id) return;
  saveCachedAppUser({ ...cached, name: user.name });
}

export async function isCurrentAppUserRegistered(): Promise<boolean> {
  const { userId } = await getCurrentUser();
  if (loadCachedAppUser(userId)) return true;
  try {
    cacheAppUser(userId, await getMyUser());
    return true;
  } catch {
    return false;
  }
}
