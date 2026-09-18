import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import SignupContent from "./SignupContent";
import { getSession } from "@/server/auth/session";
import { postAuthRedirect } from "@/lib/auth-callback";

export const metadata: Metadata = {
  title: "Criar conta | ADScale",
  description: "Crie sua conta ADScale.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Already-authenticated jump after REAL session verification (#441): a
  // stale or forged cookie renders the form instead of looping. Recovery
  // and reset screens deliberately have no such shortcut.
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
      <SignupContent />
    </Suspense>
  );
}
