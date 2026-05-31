import { Suspense } from "react";
import type { Metadata } from "next";
import AuthCard from "@/components/auth/AuthCard";
import ResetPasswordContent from "./ResetPasswordContent";

export const metadata: Metadata = {
  title: "Redefinir senha | ADScale",
  description: "Defina uma nova senha para sua conta ADScale.",
};

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--deep-bg)] px-4">
          <AuthCard>
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Carregando…</h1>
            </div>
          </AuthCard>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
