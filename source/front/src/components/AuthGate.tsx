"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Authenticator, translations } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import { I18n } from "aws-amplify/utils";
import { usePathname, useRouter } from "next/navigation";
import outputs from "../../amplify_outputs.json";
import { isMockAuth } from "@/lib/auth/config";
import { isCurrentAppUserRegistered } from "@/lib/auth/currentUser";
import { clearCachedAppUser } from "@/lib/storage";
import { useLocale } from "@/lib/text";

if (!isMockAuth()) {
  // ssr: トークンをクッキーに置き、route handler(src/app/api/v1)が読めるようにする
  Amplify.configure(outputs, { ssr: true });
  // Authenticator の文言は I18n から引く。辞書を入れないと英語のままになる
  I18n.putVocabularies(translations);
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
    isCurrentAppUserRegistered().then((registered) => {
      if (!cancelled && !registered) router.replace(REGISTRATION_PAGE_PATH);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return <>{children}</>;
}

/** 画面全体を一度だけ包む(app/layout.tsx)。ログインしていなければ Amplify のログインの画面を出す。 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const locale = useLocale();
  if (isMockAuth()) {
    return <RegistrationGate>{children}</RegistrationGate>;
  }
  // Authenticator が描く前に揃える。I18n は全体で一つなので、描くたびに呼んでも差し支えない
  I18n.setLanguage(locale);
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
