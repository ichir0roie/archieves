"use client";

import { ReactNode, useEffect } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import type { AuthUser } from "aws-amplify/auth";
import { usePathname, useRouter } from "next/navigation";
import outputs from "../../../amplify_outputs.json";
import { isMockAuth } from "@/lib/auth/config";
import { MOCK_USER } from "@/lib/auth/mockUser";
import { isCurrentAppUserRegistered } from "@/lib/auth/currentUser";

if (!isMockAuth()) {
  // ssr: トークンをクッキーに置き、route handler(src/app/api/v1)が読めるようにする
  Amplify.configure(outputs, { ssr: true });
}

type RenderProps = { signOut?: () => void; user?: AuthUser };
type AuthGateChildren = ReactNode | ((props: RenderProps) => ReactNode);

const MOCK_AUTH_USER = {
  username: MOCK_USER.username,
  userId: MOCK_USER.sub,
  signInDetails: { loginId: MOCK_USER.email },
} as unknown as AuthUser;

const REGISTRATION_PAGE_PATH = "/profile/settings";

function isRenderProp(
  children: AuthGateChildren,
): children is (props: RenderProps) => ReactNode {
  return typeof children === "function";
}

// Every page nests two AuthGate instances (its own, plus Header's), which
// would otherwise fire this check twice per navigation; collapsing
// concurrent calls into one in-flight promise keeps it to a single round
// trip to archieves-api.
let ensureRegisteredInFlight: Promise<boolean> | null = null;

async function ensureRegistered(pathname: string): Promise<boolean> {
  if (ensureRegisteredInFlight === null) {
    ensureRegisteredInFlight = (async () => {
      if (pathname === REGISTRATION_PAGE_PATH) {
        return true;
      }
      return isCurrentAppUserRegistered();
    })().finally(() => {
      ensureRegisteredInFlight = null;
    });
  }
  return ensureRegisteredInFlight;
}

function AuthenticatedGate({
  children,
  renderProps,
}: {
  children: AuthGateChildren;
  renderProps: RenderProps;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const user = renderProps.user;

  useEffect(() => {
    let cancelled = false;

    ensureRegistered(pathname).then((registered) => {
      if (!cancelled && !registered) {
        router.replace(REGISTRATION_PAGE_PATH);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user, pathname, router]);

  return <>{isRenderProp(children) ? children(renderProps) : children}</>;
}

export default function AuthGate({ children }: { children: AuthGateChildren }) {
  if (isMockAuth()) {
    return (
      <AuthenticatedGate renderProps={{ signOut: () => {}, user: MOCK_AUTH_USER }}>
        {children}
      </AuthenticatedGate>
    );
  }

  return (
    <Authenticator>
      {(props) => <AuthenticatedGate renderProps={props}>{children}</AuthenticatedGate>}
    </Authenticator>
  );
}
