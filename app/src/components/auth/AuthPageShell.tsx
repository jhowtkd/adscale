"use client";

import type { ReactNode } from "react";

export default function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--deep-bg)] px-4 relative overflow-hidden">
      <div className="absolute inset-0 dot-grid opacity-50" aria-hidden />
      <div
        className="absolute top-1/4 left-1/4 size-[500px] bg-[var(--accent-green)]/[0.02] rounded-full blur-[120px] pointer-events-none"
        aria-hidden
      />
      <div
        className="absolute bottom-1/4 right-1/4 size-[400px] bg-[var(--accent-green)]/[0.01] rounded-full blur-[100px] pointer-events-none"
        aria-hidden
      />
      {children}
    </main>
  );
}
