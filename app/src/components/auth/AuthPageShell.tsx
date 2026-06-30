"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import AuthV6BrandingPanel from "./v6/AuthV6BrandingPanel";
import { buildAuthV6BrandingLabels } from "./v6/build-auth-v6-labels";

interface AuthPageShellProps {
  children: ReactNode;
  /** @deprecated Video background removed in v6 auth shell; kept for API compatibility. */
  videoSrc?: string;
  showBranding?: boolean;
}

export default function AuthPageShell({ children, showBranding = true }: AuthPageShellProps) {
  const t = useTranslations("auth");
  const brandingLabels = buildAuthV6BrandingLabels(t);

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-8">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-40" aria-hidden />
      <div
        className="pointer-events-none absolute left-1/4 top-1/4 size-[420px] rounded-full bg-[var(--accent-primary)]/[0.04] blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-1/4 right-1/4 size-[360px] rounded-full bg-[var(--accent-primary)]/[0.03] blur-[100px]"
        aria-hidden
      />

      <div className="relative z-10 flex w-full max-w-5xl flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-8">
        {showBranding ? <AuthV6BrandingPanel labels={brandingLabels} /> : null}
        <div className="flex flex-1 items-center justify-center">{children}</div>
      </div>
    </main>
  );
}
