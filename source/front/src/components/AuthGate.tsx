"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Authenticator, translations, useAuthenticator } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import { I18n } from "aws-amplify/utils";
import { usePathname, useRouter } from "next/navigation";
import outputs from "../../amplify_outputs.json";
import { isMockAuth } from "@/lib/auth/config";
import {
  MOCK_SIGNED_OUT_COOKIE,
  hasMockSignedOutCookie,
  isOpenPath,
} from "@/lib/auth/openPaths";
import { isCurrentAppUserRegistered } from "@/lib/auth/currentUser";
import {
  clearCachedAppUser,
  subscribeCachedAppUser,
} from "@/lib/storage";
import LegalLinks from "@/components/LegalLinks";
import { isPublicPath } from "@/lib/scoreShare";
import { useT } from "@/lib/text";
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

const SignedInContext = createContext(true);

/**
 * ログインしているか。ログインしていなくても開ける画面(lib/auth/openPaths.ts)でだけ false になる。
 * それ以外の画面は、ログインの門を通ったあとにしか描かないので、いつも true
 */
export function useSignedIn(): boolean {
  return useContext(SignedInContext);
}

function SignedOut({ children }: { children: ReactNode }) {
  return <SignedInContext.Provider value={false}>{children}</SignedInContext.Provider>;
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

/** サインインの画面の下に出す、規約・ポリシーへのリンクと同意の文 */
function AgreementFooter() {
  const T = useT();
  return (
    <p className="auth-agreement muted small">
      {T.legal.agreement}
      <br />
      <LegalLinks />
    </p>
  );
}

const AUTHENTICATOR_COMPONENTS = { Footer: AgreementFooter };

function subscribeNothing() {
  return () => {};
}

/** モックのログインで、ログインしていない人を真似ているか。サーバーで描くときは分からないので null */
function useMockSignedOut(): boolean | null {
  return useSyncExternalStore(
    subscribeNothing,
    () => hasMockSignedOutCookie(document.cookie),
    () => null,
  );
}

/** モックのログインの門。ログインなしを真似ているときは、開ける画面だけを出し、ほかはサインインのボタンを出す */
function MockGate({ pathname, children }: { pathname: string; children: ReactNode }) {
  const T = useT();
  const signedOut = useMockSignedOut();
  if (signedOut === null) return null;
  if (!signedOut) return <RegistrationGate>{children}</RegistrationGate>;
  if (isOpenPath(pathname)) return <SignedOut>{children}</SignedOut>;
  return (
    // layout.tsx の main の代わりに描くので、余白のために main で包む
    <main>
      <div className="page">
        <p className="status empty">{T.anonymous.signInRequired}</p>
        <button
          type="button"
          className="primary large"
          onClick={() => {
            document.cookie = `${MOCK_SIGNED_OUT_COOKIE}=; path=/; max-age=0`;
            window.location.reload();
          }}
        >
          {T.anonymous.signIn}
        </button>
      </div>
    </main>
  );
}

/** Cognito のログインの門。ログインしていなければ、開ける画面はそのまま出し、ほかは Amplify のログインの画面を出す */
function CognitoGate({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  if (authStatus === "unauthenticated" && isOpenPath(pathname)) {
    return <SignedOut>{children}</SignedOut>;
  }
  return (
    <Authenticator components={AUTHENTICATOR_COMPONENTS}>
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

/**
 * 画面全体を一度だけ包む(app/layout.tsx)。ログインしていなければ Amplify のログインの画面を出す。
 * ただし、ログインしていなくても開ける画面(ホーム・使い方・ランキング・プロフィール)は、公開の分だけで出す
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // スコアの公開ページ。ログインの画面も登録の確かめも挟まない。
  // ログインしていればクッキーのトークンを route handler が読み、API が公開範囲を当てる
  if (isPublicPath(pathname)) {
    return <>{children}</>;
  }
  if (isMockAuth()) {
    return <MockGate pathname={pathname}>{children}</MockGate>;
  }
  return (
    <Authenticator.Provider>
      <CognitoGate pathname={pathname}>{children}</CognitoGate>
    </Authenticator.Provider>
  );
}
