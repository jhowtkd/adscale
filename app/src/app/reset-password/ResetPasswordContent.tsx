"use client";

import { Suspense, useReducer } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AuthCard from "@/components/auth/AuthCard";
import AuthPageShell from "@/components/auth/AuthPageShell";
import { AuthV6ErrorAlert, AuthV6SuccessAlert } from "@/components/auth/v6/AuthV6Alert";
import AuthV6Header from "@/components/auth/v6/AuthV6Header";
import PasswordInput from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

interface ResetPasswordState {
  newPassword: string;
  confirmPassword: string;
  error: string;
  success: boolean;
  loading: boolean;
}

function resetPasswordReducer(
  state: ResetPasswordState,
  payload: Partial<ResetPasswordState>,
): ResetPasswordState {
  return { ...state, ...payload };
}

const authFieldClass =
  "rounded-[var(--radius-control)] border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]";

const authPrimaryButtonClass =
  "w-full rounded-[var(--radius-control)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-primary-hover)]";

const authTextLinkClass = "font-medium text-[var(--accent-primary-text)] hover:underline";

export default function ResetPasswordContent() {
  return (
    <Suspense fallback={<ResetPasswordLoading />}>
      <ResetPasswordContentInner />
    </Suspense>
  );
}

function ResetPasswordLoading() {
  const t = useTranslations("auth");

  return (
    <AuthPageShell showBranding={false}>
      <AuthCard>
        <AuthV6Header sectionLabel={t("v6.accessLabel")} title={t("loading")} subtitle="" showLogo />
      </AuthCard>
    </AuthPageShell>
  );
}

function ResetPasswordContentInner() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, dispatch] = useReducer(resetPasswordReducer, {
    newPassword: "",
    confirmPassword: "",
    error: !token ? t("invalidResetToken") : "",
    success: false,
    loading: false,
  });
  const { newPassword, confirmPassword, error, success, loading } = state;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    dispatch({ error: "" });

    if (newPassword !== confirmPassword) {
      dispatch({ error: t("passwordMismatch") });
      return;
    }

    if (!token) {
      dispatch({ error: t("invalidResetToken") });
      return;
    }

    dispatch({ loading: true });

    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword,
        token,
      });

      if (resetError) {
        throw new Error(resetError.message || t("genericError"));
      }

      dispatch({ success: true });
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      dispatch({ error: err instanceof Error ? err.message : t("genericError") });
    } finally {
      dispatch({ loading: false });
    }
  }

  return (
    <AuthPageShell showBranding={false}>
      <AuthCard>
        <div className="space-y-6">
          <AuthV6Header
            sectionLabel={t("v6.accessLabel")}
            title={t("resetPasswordTitle")}
            subtitle={t("resetPasswordSubtitle")}
            showLogo
          />

          {success ? (
            <div className="space-y-4">
              <AuthV6SuccessAlert>{t("passwordResetSuccess")}</AuthV6SuccessAlert>
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
                <PasswordInput
                  id="new-password"
                  label={t("newPassword")}
                  placeholder={t("createPasswordPlaceholder")}
                  value={newPassword}
                  onChange={(value) => dispatch({ newPassword: value })}
                  showStrengthMeter
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-[var(--text-primary)]">
                  {t("confirmNewPassword")}
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("createPasswordPlaceholder")}
                  value={confirmPassword}
                  onChange={(e) => dispatch({ confirmPassword: e.target.value })}
                  required
                  className={authFieldClass}
                />
              </div>
              <Button type="submit" className={authPrimaryButtonClass} disabled={loading || !token}>
                {loading ? t("resettingPassword") : t("resetPassword")}
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
