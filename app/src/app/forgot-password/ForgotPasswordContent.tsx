"use client";

import { useState } from "react";
import AuthCard from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

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
    <div className="flex min-h-screen items-center justify-center bg-[var(--deep-bg)] px-4">
      <AuthCard>
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("forgotPasswordTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("forgotPasswordSubtitle")}
            </p>
          </div>

          {success ? (
            <div className="space-y-4">
              <div className="rounded-md bg-[var(--accent-green)]/10 px-3 py-2 text-sm text-[var(--accent-green)]">
                {t("resetLinkSent")}
              </div>
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="underline hover:text-primary">
                  {t("backToLogin")}
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("sendingResetLink") : t("sendResetLink")}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="underline hover:text-primary">
                  {t("backToLogin")}
                </Link>
              </p>
            </form>
          )}
        </div>
      </AuthCard>
    </div>
  );
}
