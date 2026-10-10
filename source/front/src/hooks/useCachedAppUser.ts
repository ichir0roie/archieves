import { useEffect, useState } from "react";
import { getCachedAppUser } from "@/lib/auth/currentUser";
import { subscribeCachedAppUser, type CachedAppUser } from "@/lib/storage";

/** キャッシュにある今の利用者(名前・管理者か)。API は叩かず、キャッシュが書き換わったら読み直す */
export function useCachedAppUser(): CachedAppUser | null {
  const [user, setUser] = useState<CachedAppUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    function read() {
      getCachedAppUser().then(
        (cached) => {
          if (!cancelled) setUser(cached);
        },
        () => {
          if (!cancelled) setUser(null);
        }
      );
    }
    read();
    const unsubscribe = subscribeCachedAppUser(read);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return user;
}
