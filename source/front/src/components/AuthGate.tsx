"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import { usePathname, useRouter } from "next/navigation";
import outputs from "../../amplify_outputs.json";
import { isMockAuth } from "@/lib/auth/config";
import { isCurrentAppUserRegistered } from "@/lib/auth/currentUser";
import { clearCachedAppUser } from "@/lib/storage";
import { useT } from "@/lib/text";

if (!isMockAuth()) {
  // ssr: トークンをクッキーに置き、route handler(src/app/api/v1)が読めるようにする
  Amplify.configure(outputs, { ssr: true });
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
  const T = useT();
  if (isMockAuth()) {
    return <RegistrationGate>{children}</RegistrationGate>;
  }
  return (
    <Authenticator
      formFields={{
        // User Pool の aliasAttributes で、ユーザ名の欄にメールアドレスを入れてもログインできる
        signIn: {
          username: {
            label: T.auth.usernameOrEmail,
            placeholder: T.auth.usernameOrEmail,
          },
        },
      }}
    >
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
