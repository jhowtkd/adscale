import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./index";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function requireAuth(redirectTo = "/login") {
  const session = await getSession();
  if (!session) {
    redirect(redirectTo);
  }
  return session;
}

export const getSessionFromHeaders = cache(async (requestHeaders: Headers) => {
  return auth.api.getSession({ headers: requestHeaders });
});
