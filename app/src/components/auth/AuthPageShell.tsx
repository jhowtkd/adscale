"use client";

import type { ReactNode } from "react";
import Link from "next/link";

interface AuthPageShellProps {
  children: ReactNode;
  /** @deprecated Video background removed in v6 auth shell; kept for API compatibility. */
  videoSrc?: string;
  showBranding?: boolean;
}

export default function AuthPageShell({ children, showBranding = true }: AuthPageShellProps) {
  void showBranding; // compatibility with the existing auth route interface

  return (
    <main id="main" className="relative isolate flex min-h-screen w-full items-center justify-center bg-[var(--canvas)] px-4 py-8">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-40" aria-hidden />
      <div className="relative z-10 w-full max-w-[440px]">
        <div className="mb-5 flex items-center justify-between px-1 text-sm text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">ADScale</span>
          <Link href="/" className="underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Ver o site</Link>
        </div>
        {children}
      </div>
    </main>
  );
}
