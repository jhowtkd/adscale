"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import ImageCursorTrail from "@/components/ui/image-cursor-trail";
import AuthV6BrandingPanel from "./v6/AuthV6BrandingPanel";
import { buildAuthV6BrandingLabels } from "./v6/build-auth-v6-labels";

const AUTH_TRAIL_IMAGES = [
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=800&auto=format",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=800&auto=format",
  "https://images.unsplash.com/photo-1482192596544-9eb780fc7f66?q=80&w=800&auto=format",
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=800&auto=format",
  "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?q=80&w=800&auto=format",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?q=80&w=800&auto=format",
  "https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=800&auto=format",
  "https://images.unsplash.com/photo-1465101162946-4377e57745c3?q=80&w=800&auto=format",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=800&auto=format",
] as const;

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
    <ImageCursorTrail
      items={[...AUTH_TRAIL_IMAGES]}
      maxNumberOfImages={5}
      distance={25}
      imgClassName="h-36 w-28 brightness-75 saturate-75 sm:h-48 sm:w-40"
      className="isolate flex min-h-screen w-full items-center justify-center bg-[var(--canvas)] px-4 py-8"
    >
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-40" aria-hidden />
      <main className="relative z-50 flex w-full max-w-5xl flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-8">
        {showBranding ? <AuthV6BrandingPanel labels={brandingLabels} /> : null}
        <div className="flex flex-1 items-center justify-center">{children}</div>
      </main>
    </ImageCursorTrail>
  );
}
