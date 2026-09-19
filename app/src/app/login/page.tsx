import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import LoginContent from "./LoginContent";
import { getSession } from "@/server/auth/session";
import { safeCallbackPath } from "@/lib/auth-callback";

export const metadata: Metadata = {
  title: "Login | ADScale",
  description: "Entre na sua conta ADScale.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await getSession();
  if (session) {
    const params = await searchParams;
    const callback = safeCallbackPath(params.callbackUrl ?? null);
    redirect(callback === "/login" || callback.startsWith("/login?") ? "/" : callback);
  }
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
