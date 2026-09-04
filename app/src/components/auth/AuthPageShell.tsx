"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

interface AuthPageShellProps {
  children: ReactNode;
  /** @deprecated Video background removed in v6 auth shell; kept for API compatibility. */
  videoSrc?: string;
  showBranding?: boolean;
}

export default function AuthPageShell({ children }: AuthPageShellProps) {
  return (
    <main
      id="main"
      className="relative isolate flex min-h-screen w-full items-center justify-center bg-[var(--canvas)] px-4 py-8"
    >
      <div className="relative z-10 w-full max-w-[440px]">
        <Link href="/" className="mb-8 flex justify-center rounded-md py-0.5" aria-label="ADScale">
          <Image
            src="/images/logo.svg"
            alt=""
            aria-hidden="true"
            className="v6-sidebar-logo block h-[22px] w-auto max-w-[130px]"
            width={813}
            height={142}
            priority
            unoptimized
          />
        </Link>
        {children}
      </div>
    </main>
  );
}
