"use client";

import type { ReactNode } from "react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

interface AuthPageShellProps {
  children: ReactNode;
  videoSrc?: string;
}

export default function AuthPageShell({ children, videoSrc }: AuthPageShellProps) {
  const prefersReducedMotion = useReducedMotion();
  const showVideo = Boolean(videoSrc) && !prefersReducedMotion;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--deep-bg)] px-4 relative overflow-hidden">
      {showVideo ? (
        <>
          <video
            autoPlay
            loop
            muted
            playsInline
            aria-hidden
            className="absolute inset-0 size-full object-cover"
            src={videoSrc}
          />
          <div
            className="absolute inset-0 bg-[var(--deep-bg)]/55 pointer-events-none"
            aria-hidden
          />
        </>
      ) : (
        <div className="absolute inset-0 dot-grid opacity-50" aria-hidden />
      )}
      <div
        className="absolute top-1/4 left-1/4 size-[500px] bg-[var(--accent-green)]/[0.02] rounded-full blur-[120px] pointer-events-none"
        aria-hidden
      />
      <div
        className="absolute bottom-1/4 right-1/4 size-[400px] bg-[var(--accent-green)]/[0.01] rounded-full blur-[100px] pointer-events-none"
        aria-hidden
      />
      <div className="relative z-10 w-full flex justify-center">{children}</div>
    </main>
  );
}
