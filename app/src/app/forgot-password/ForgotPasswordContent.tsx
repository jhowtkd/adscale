"use client";

import { useState } from "react";
import AuthCard from "@/components/auth/AuthCard";
import AuthPageShell from "@/components/auth/AuthPageShell";
import { AuthV6ErrorAlert, AuthV6SuccessAlert } from "@/components/auth/v6/AuthV6Alert";
import AuthV6Header from "@/components/auth/v6/AuthV6Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

const authFieldClass =
  "rounded-[var(--radius-control)] border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:border-[var(--neutral-border)] focus-visible:ring-[var(--focus-ring)]";

const authPrimaryButtonClass =
  "w-full rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)]";

const authTextLinkClass =
  "font-medium text-[var(--neutral-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

export default function ForgotPasswordContent() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error: forgetError } = await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      });

      if (forgetError) {
        throw new Error(forgetError.message || t("genericError"));
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell showBranding={false}>
      <AuthCard>
        <div className="space-y-6">
          <AuthV6Header
            sectionLabel={t("v6.accessLabel")}
            title={t("forgotPasswordTitle")}
            subtitle={t("forgotPasswordSubtitle")}
            showLogo
          />

          {success ? (
            <div className="space-y-4">
              <AuthV6SuccessAlert>{t("resetLinkSent")}</AuthV6SuccessAlert>
              <p className="text-center text-sm text-[var(--text-secondary)]">
                <Link href="/login" className={authTextLinkClass}>
                  {t("backToSignIn")}
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error ? <AuthV6ErrorAlert>{error}</AuthV6ErrorAlert> : null}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[var(--text-primary)]">
                  {t("email")}
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={authFieldClass}
                />
              </div>
              <Button type="submit" className={authPrimaryButtonClass} disabled={loading}>
                {loading ? t("sendingResetLink") : t("sendResetLink")}
              </Button>
              <p className="text-center text-sm text-[var(--text-secondary)]">
                <Link href="/login" className={authTextLinkClass}>
                  {t("backToSignIn")}
                </Link>
              </p>
            </form>
          )}
        </div>
      </AuthCard>
    </AuthPageShell>
  );
}
