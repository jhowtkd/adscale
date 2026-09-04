import { Suspense } from "react";
import type { Metadata } from "next";
import AuthPageShell from "@/components/auth/AuthPageShell";
import InviteContent from "./InviteContent";

export const metadata: Metadata = {
  title: "Accept invite | ADScale",
  description: "Accept your workspace invitation.",
};

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <AuthPageShell>
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        </AuthPageShell>
      }
    >
      <InviteContent />
    </Suspense>
  );
}
