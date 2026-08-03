import { Suspense } from "react";
import type { Metadata } from "next";
import AuthCard from "@/components/auth/AuthCard";
import InviteContent from "./InviteContent";

export const metadata: Metadata = {
  title: "Accept invite | ADScale",
  description: "Accept your workspace invitation.",
};

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4">
          <AuthCard>
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Loading…</h1>
            </div>
          </AuthCard>
        </div>
      }
    >
      <InviteContent />
    </Suspense>
  );
}
