import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import LoginContent from "./LoginContent";
import { getSession } from "@/server/auth/session";
import { postAuthRedirect } from "@/lib/auth-callback";

export const metadata: Metadata = {
  title: "Login | ADScale",
  description: "Entre na sua conta ADScale.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Already-authenticated jump after REAL session verification (#441): a
  // stale or forged cookie renders the form instead of looping.
  const session = await getSession();
  if (session) {
    const params = await searchParams;
    const raw = params.callbackUrl;
    redirect(
      postAuthRedirect(
        typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : null,
      ),
    );
  }
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
