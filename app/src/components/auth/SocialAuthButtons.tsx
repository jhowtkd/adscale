"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

interface SocialAuthButtonsProps {
  mode: "login" | "signup";
  callbackURL?: string;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1C5.925 1 1 5.925 1 12c0 4.86 3.152 8.983 7.523 10.437.55.101.75-.238.75-.53 0-.261-.009-.952-.014-1.87-3.06.664-3.706-1.475-3.706-1.475-.5-1.27-1.221-1.61-1.221-1.61-.998-.682.076-.668.076-.668 1.104.078 1.685 1.134 1.685 1.134.98 1.68 2.573 1.195 3.2.914.1-.71.384-1.195.698-1.47-2.442-.278-5.01-1.222-5.01-5.437 0-1.2.428-2.183 1.132-2.95-.114-.278-.491-1.397.107-2.91 0 0 .92-.295 3.013 1.127a10.503 10.503 0 0 1 5.484 0c2.09-1.422 3.01-1.127 3.01-1.127.6 1.513.223 2.632.11 2.91.705.767 1.13 1.75 1.13 2.95 0 4.226-2.573 5.156-5.022 5.428.395.34.747 1.01.747 2.037 0 1.47-.014 2.657-.014 3.017 0 .295.2.637.76.53C19.85 20.98 23 16.859 23 12c0-6.075-4.925-11-11-11z" />
    </svg>
  );
}

export default function SocialAuthButtons({ mode, callbackURL = "/" }: SocialAuthButtonsProps) {
  const t = useTranslations("auth");
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSocialSignIn(provider: "google" | "github") {
    setLoading(provider);
    try {
      await authClient.signIn.social({
        provider,
        callbackURL,
      });
    } catch {
      // OAuth redirect happens before this usually, but handle edge cases
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-[var(--border-subtle)]" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-[var(--surface-base)] px-2 text-[var(--text-secondary)]">
            {t("orContinueWith")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] w-full gap-2 rounded-[var(--radius-control)] border-[var(--neutral-border)] bg-[var(--surface-raised)] text-[var(--neutral-text)] hover:bg-[var(--neutral-bg)]"
          onClick={() => handleSocialSignIn("google")}
          disabled={loading !== null}
        >
          <GoogleIcon className="size-4 text-[var(--neutral-text)]" />
          <span className="text-sm">Google</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] w-full gap-2 rounded-[var(--radius-control)] border-[var(--neutral-border)] bg-[var(--surface-raised)] text-[var(--neutral-text)] hover:bg-[var(--neutral-bg)]"
          onClick={() => handleSocialSignIn("github")}
          disabled={loading !== null}
        >
          <GitHubIcon className="size-4 text-[var(--neutral-text)]" />
          <span className="text-sm">GitHub</span>
        </Button>
      </div>

      {mode === "signup" && (
        <p className="text-center text-[11px] text-[var(--text-secondary)] leading-relaxed">
          {t("socialConsentPrefix")}{" "}
          <Link
            href="/terms"
            className="text-[var(--neutral-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            target="_blank"
          >
            {t("terms")}
          </Link>{" "}
          {t("and")}{" "}
          <Link
            href="/privacy"
            className="text-[var(--neutral-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            target="_blank"
          >
            {t("privacy")}
          </Link>
          .
        </p>
      )}
    </div>
  );
}
