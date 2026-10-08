import { getCurrentUser as amplifyGetCurrentUser } from "aws-amplify/auth";
import { ensureCurrentUser, getMyUser } from "@/lib/api";
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

interface CurrentAppUser {
  id: number;
  username: string;
}

export async function getCurrentAppUser(): Promise<CurrentAppUser> {
  const { username, email } = await getCurrentUser();
  const user = await ensureCurrentUser({ name: email });
  return { id: user.id, username };
}

export async function isCurrentAppUserRegistered(): Promise<boolean> {
  try {
    await getMyUser();
    return true;
  } catch {
    return false;
  }
}
