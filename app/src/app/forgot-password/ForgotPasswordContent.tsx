"use client";

import { useState } from "react";
import AuthCard from "@/components/auth/AuthCard";
import AuthPageShell from "@/components/auth/AuthPageShell";
import { AuthV6ErrorAlert, AuthV6SuccessAlert } from "@/components/auth/v6/AuthV6Alert";
import AuthV6Header from "@/components/auth/v6/AuthV6Header";
import {
  authFieldClass,
  authPrimaryButtonClass,
  authTextLinkClass,
} from "@/components/auth/auth-chrome";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { authEntryHref, safeCallbackPath } from "@/lib/auth-callback";

export default function ForgotPasswordContent() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackPath(searchParams.get("callbackUrl"));
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
        redirectTo: authEntryHref("/reset-password", callbackUrl),
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
          />

          {success ? (
            <div className="space-y-4">
              <AuthV6SuccessAlert>{t("resetLinkSent")}</AuthV6SuccessAlert>
              <p className="text-center text-sm text-[var(--text-secondary)]">
                <Link href={authEntryHref("/login", callbackUrl)} className={authTextLinkClass}>
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
              <button type="submit" className={authPrimaryButtonClass} disabled={loading}>
                {loading ? t("sendingResetLink") : t("sendResetLink")}
              </button>
              <p className="text-center text-sm text-[var(--text-secondary)]">
                <Link href={authEntryHref("/login", callbackUrl)} className={authTextLinkClass}>
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
