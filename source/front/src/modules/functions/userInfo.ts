import { fetchAuthSession, JWT } from "aws-amplify/auth";

const STORAGE_KEY = "userInfo";

export class UserInfo {
  sub: string;
  email: string;
  accessToken: JWT;
  idToken: JWT;
  token: string;

  constructor(sub: string, email: string, accessToken: JWT, idToken: JWT) {
    this.sub = sub;
    this.email = email;
    this.accessToken = accessToken;
    this.idToken = idToken;
    this.token = this.idToken.toString();
  }
}

export async function setUserInfo(
  sub: string | undefined,
  email: string | undefined,
): Promise<UserInfo> {
  if (sub === undefined || email === undefined) {
    throw new Error("sub or email is undefined");
  }
  const session = await fetchAuthSession();
  if (
    session.tokens?.accessToken === undefined ||
    session.tokens?.idToken === undefined
  ) {
    throw new Error("tokens are undefined");
  }
  const userInfo = new UserInfo(
    sub,
    email,
    session.tokens.accessToken,
    session.tokens.idToken,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userInfo));
  return userInfo;
}

export function getUserInfo(): UserInfo {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === null) {
    throw new Error("userInfo is not set");
  }
  return JSON.parse(stored) as UserInfo;
}
