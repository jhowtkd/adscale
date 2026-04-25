import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./index";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireAuth(redirectTo = "/login") {
  const session = await getSession();
  if (!session) {
    redirect(redirectTo);
  }
  return session;
}

export async function getSessionFromHeaders(requestHeaders: Headers) {
  return auth.api.getSession({ headers: requestHeaders });
}
