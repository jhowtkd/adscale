import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import SignupContent from "./SignupContent";
import { getSession } from "@/server/auth/session";
import { safeCallbackPath } from "@/lib/auth-callback";

export const metadata: Metadata = {
  title: "Criar conta | ADScale",
  description: "Crie sua conta ADScale.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await getSession();
  if (session) {
    const params = await searchParams;
    const callback = safeCallbackPath(params.callbackUrl ?? null);
    redirect(callback === "/signup" || callback.startsWith("/signup?") ? "/" : callback);
  }
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}
