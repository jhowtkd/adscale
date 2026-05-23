"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AuthCard from "@/components/auth/AuthCard";
import PasswordInput from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(() => (!token ? t("invalidToken") : ""));
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    if (!token) {
      setError(t("invalidToken"));
      return;
    }

    setLoading(true);

    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword,
        token,
      });

      if (resetError) {
        throw new Error(resetError.message || t("genericError"));
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 2000);
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
              {t("resetPasswordTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("resetPasswordSubtitle")}
            </p>
          </div>

          {success ? (
            <div className="space-y-4">
              <div className="rounded-md bg-[var(--accent-mint)]/10 px-3 py-2 text-sm text-[var(--accent-mint)]">
                {t("passwordResetSuccess")}
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
                <PasswordInput
                  id="new-password"
                  label={t("newPassword")}
                  placeholder={t("createPasswordPlaceholder")}
                  value={newPassword}
                  onChange={setNewPassword}
                  showStrengthMeter
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">
                  {t("confirmNewPassword")}
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("createPasswordPlaceholder")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !token}
              >
                {loading ? t("resettingPassword") : t("resetPassword")}
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
