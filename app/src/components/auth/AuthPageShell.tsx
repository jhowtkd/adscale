"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import ImageCursorTrail from "@/components/ui/image-cursor-trail";
import { cn } from "@/lib/utils";

interface AuthPageShellProps {
  children: ReactNode;
  /** @deprecated Video background removed in v6 auth shell; kept for API compatibility. */
  videoSrc?: string;
  showBranding?: boolean;
}

const AUTH_PIECES = [
  "/images/auth/nike-1.png",
  "/images/auth/amazon-1.png",
  "/images/auth/burger-king-2.png",
  "/images/auth/nike-2.png",
];

const AUTH_EDGES = [
  { className: "left-[-18%] top-[4%] w-[46%] max-w-md rotate-[-7deg]", src: AUTH_PIECES[0] },
  { className: "right-[-20%] top-[8%] w-[42%] max-w-md rotate-[6deg]", src: AUTH_PIECES[1] },
  { className: "left-[-16%] bottom-[-6%] w-[40%] max-w-sm rotate-[4deg]", src: AUTH_PIECES[2] },
  { className: "right-[-18%] bottom-[-8%] w-[44%] max-w-md rotate-[-5deg]", src: AUTH_PIECES[3] },
];

function AuthOccupancy() {
  return (
    <div data-testid="auth-occupancy" aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <ImageCursorTrail
        items={AUTH_PIECES}
        className="absolute inset-0 motion-reduce:hidden"
        imgClassName="h-48 w-36 rounded-2xl"
        maxNumberOfImages={4}
        fadeAnimation
        distance={14}
      />
      {AUTH_EDGES.map((tile) => (
        <div
          key={tile.className}
          className={cn(
            "pointer-events-none absolute overflow-hidden rounded-2xl border border-white/10 bg-[var(--surface-raised)] opacity-70 motion-reduce:rotate-0",
            tile.className,
          )}
        >
          {/* Native img matches Palco occupancy; Next/Image is reserved for the mark. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tile.src} alt="" className="aspect-[4/5] w-full object-cover" />
        </div>
      ))}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--canvas)_18%,oklch(0.145_0.004_260_/_0.78)_52%,transparent_80%)]" />
    </div>
  );
}

export default function AuthPageShell({ children }: AuthPageShellProps) {
  return (
    <main
      id="main"
      className="relative isolate flex min-h-screen w-full items-center justify-center overflow-hidden bg-[var(--canvas)] px-4 py-8"
    >
      <AuthOccupancy />
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
