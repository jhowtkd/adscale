"use client";

import { useReducer } from "react";
import AuthCard from "@/components/auth/AuthCard";
import AuthPageShell from "@/components/auth/AuthPageShell";
import { AuthV6ErrorAlert, AuthV6SuccessAlert } from "@/components/auth/v6/AuthV6Alert";
import AuthV6Header from "@/components/auth/v6/AuthV6Header";
import {
  authFieldClass,
  authPrimaryButtonClass,
  authTextLinkClass,
} from "@/components/auth/auth-chrome";
import PasswordInput from "@/components/auth/PasswordInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { authEntryHref, safeCallbackPath } from "@/lib/auth-callback";

interface SignupState {
  name: string;
  email: string;
  password: string;
  consent: boolean;
  error: string;
  loading: boolean;
  submittedEmail: string;
  resending: boolean;
  resendSuccess: boolean;
  resendError: string;
}

const initialSignupState: SignupState = {
  name: "",
  email: "",
  password: "",
  consent: false,
  error: "",
  loading: false,
  submittedEmail: "",
  resending: false,
  resendSuccess: false,
  resendError: "",
};

function signupReducer(state: SignupState, payload: Partial<SignupState>): SignupState {
  return { ...state, ...payload };
}

export default function SignupContent() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackPath(searchParams.get("callbackUrl"));
  const loginHref = authEntryHref("/login", callbackUrl);
  const [state, dispatch] = useReducer(signupReducer, initialSignupState);
  const {
    name,
    email,
    password,
    consent,
    error,
    loading,
    submittedEmail,
    resending,
    resendSuccess,
    resendError,
  } = state;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    dispatch({ error: "" });

    if (!consent) {
      dispatch({ error: t("consentRequired") });
      return;
    }

    dispatch({ loading: true });

    try {
      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, callbackURL: callbackUrl }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Signup failed");
      }

      dispatch({ submittedEmail: email, error: "" });
    } catch (err) {
      dispatch({ error: err instanceof Error ? err.message : "Signup failed" });
    } finally {
      dispatch({ loading: false });
    }
  }

  async function handleResend() {
    if (!submittedEmail || resending) return;
    dispatch({ resending: true, resendSuccess: false, resendError: "" });

    try {
      const res = await authClient.sendVerificationEmail({
        email: submittedEmail,
        callbackURL: callbackUrl,
      });

      if (res?.error) {
        throw new Error(res.error.message || t("verificationEmailError"));
      }

      dispatch({ resendSuccess: true });
    } catch (err) {
      dispatch({
        resendError: err instanceof Error ? err.message : t("verificationEmailError"),
      });
    } finally {
      dispatch({ resending: false });
    }
  }

  if (submittedEmail) {
    return (
      <AuthPageShell>
        <AuthCard>
          <div className="space-y-6">
            <AuthV6Header
              sectionLabel={t("v6.accessLabel")}
              title={t("confirmEmailTitle")}
              subtitle={t("confirmEmailSubtitle")}
            />

            <div className="space-y-4">
              {resendSuccess ? (
                <AuthV6SuccessAlert>{t("verificationEmailSent")}</AuthV6SuccessAlert>
              ) : null}

              {resendError ? (
                <AuthV6ErrorAlert>{resendError}</AuthV6ErrorAlert>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)]">
                  {t("confirmEmailSentTo")}
                </p>
                <p className="break-all text-sm font-medium text-[var(--text-primary)]">
                  {submittedEmail}
                </p>
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                  {t("confirmEmailTrialNotice")}
                </p>
              </div>

              <button
                type="button"
                className={authPrimaryButtonClass}
                onClick={handleResend}
                disabled={resending}
              >
                {resending ? t("resendingVerificationEmail") : t("resendVerificationEmail")}
              </button>
            </div>

            <p className="text-center text-sm text-[var(--text-secondary)]">
              {t("hasAccount")}{" "}
              <Link href={loginHref} className={authTextLinkClass}>
                {t("signIn")}
              </Link>
            </p>
          </div>
        </AuthCard>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <AuthCard>
        <div className="space-y-6">
          <AuthV6Header
            sectionLabel={t("v6.accessLabel")}
            title={t("createAccountTitle")}
            subtitle={t("signUpSubtitle")}
          />

          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? <AuthV6ErrorAlert>{error}</AuthV6ErrorAlert> : null}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[var(--text-primary)]">
                {t("name")}
              </Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => dispatch({ name: e.target.value })}
                required
                className={authFieldClass}
              />
            </div>
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
                onChange={(e) => dispatch({ email: e.target.value })}
                required
                className={authFieldClass}
              />
            </div>
            <div className="space-y-2">
              <PasswordInput
                id="signup-password"
                label={t("password")}
                placeholder={t("createPasswordPlaceholder")}
                value={password}
                onChange={(value) => dispatch({ password: value })}
                showStrengthMeter
                showRequirements
                autoComplete="new-password"
              />
            </div>
            <label className="flex items-start gap-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => dispatch({ consent: e.target.checked })}
                className="mt-0.5 accent-[var(--neutral-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              />
              <span>
                {t("consentPrefix")}{" "}
                <Link href="/terms" className={authTextLinkClass} target="_blank">
                  {t("terms")}
                </Link>{" "}
                {t("and")}{" "}
                <Link href="/privacy" className={authTextLinkClass} target="_blank">
                  {t("privacy")}
                </Link>
                .
              </span>
            </label>
            <button type="submit" className={authPrimaryButtonClass} disabled={loading}>
              {loading ? t("creatingAccount") : t("signUp")}
            </button>
          </form>

          <p className="text-center text-sm text-[var(--text-secondary)]">
            {t("hasAccount")}{" "}
            <Link href={loginHref} className={authTextLinkClass}>
              {t("signIn")}
            </Link>
          </p>
        </div>
      </AuthCard>
    </AuthPageShell>
  );
}
