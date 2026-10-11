"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Authenticator, translations } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import { I18n } from "aws-amplify/utils";
import { usePathname, useRouter } from "next/navigation";
import outputs from "../../amplify_outputs.json";
import { isMockAuth } from "@/lib/auth/config";
import { isCurrentAppUserRegistered } from "@/lib/auth/currentUser";
import {
  clearCachedAppUser,
  subscribeCachedAppUser,
} from "@/lib/storage";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeLocale,
} from "@/lib/text/locale";

if (!isMockAuth()) {
  // ssr: トークンをクッキーに置き、route handler(src/app/api/v1)が読めるようにする
  Amplify.configure(outputs, { ssr: true });
  // Authenticator の文言は I18n から引く。辞書を入れないと英語のままになる
  I18n.putVocabularies(translations);
  // Authenticator は描くときに I18n の言語を引くので、描く前(読み込んだとき)に揃え、言語を変えたら
  // React が描き直す前に合わせる。I18n は全体で一つなので、画面全体を包む AuthGate のここで一度だけ持つ
  if (typeof window === "undefined") {
    I18n.setLanguage(DEFAULT_LOCALE);
  } else {
    I18n.setLanguage(readLocale());
    subscribeLocale(() => I18n.setLanguage(readLocale()));
  }
}

const REGISTRATION_PAGE_PATH = "/profile/settings";

const SignOutContext = createContext<() => void>(() => {});

/** ログアウトする関数。モックのログインでは何もしない。 */
export function useSignOut(): () => void {
  return useContext(SignOutContext);
}

/** API に行の無い利用者(初めてログインした人)を、プロフィールの登録へ送る。登録が済んでキャッシュにあれば API は叩かない。 */
function RegistrationGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === REGISTRATION_PAGE_PATH) return;
    let cancelled = false;
    const check = () => {
      isCurrentAppUserRegistered().then((registered) => {
        if (!cancelled && !registered) router.replace(REGISTRATION_PAGE_PATH);
      });
    };
    check();
    // API が本人の行が無いと返すと、キャッシュが消える(lib/api/client.ts)。そのとき確かめ直す
    const unsubscribe = subscribeCachedAppUser(check);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [pathname, router]);

  return <>{children}</>;
}

/** 画面全体を一度だけ包む(app/layout.tsx)。ログインしていなければ Amplify のログインの画面を出す。 */
export default function AuthGate({ children }: { children: ReactNode }) {
  if (isMockAuth()) {
    return <RegistrationGate>{children}</RegistrationGate>;
  }
  return (
    <Authenticator>
      {({ signOut }) => (
        <SignOutContext.Provider
          value={() => {
            clearCachedAppUser();
            signOut?.();
          }}
        >
          <RegistrationGate>{children}</RegistrationGate>
        </SignOutContext.Provider>
      )}
    </Authenticator>
  );
}
