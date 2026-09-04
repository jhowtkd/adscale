import { Suspense } from "react";
import type { Metadata } from "next";
import AuthPageShell from "@/components/auth/AuthPageShell";
import ResetPasswordContent from "./ResetPasswordContent";

export const metadata: Metadata = {
  title: "Redefinir senha | ADScale",
  description: "Defina uma nova senha para sua conta ADScale.",
};

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthPageShell>
          <p className="text-sm text-[var(--text-secondary)]">Carregando…</p>
        </AuthPageShell>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
