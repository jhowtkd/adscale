"use client";

import { useReducer } from "react";
import AuthCard from "@/components/auth/AuthCard";
import AuthPageShell from "@/components/auth/AuthPageShell";
import { AuthV6ErrorAlert, AuthV6SuccessAlert } from "@/components/auth/v6/AuthV6Alert";
import AuthV6Header from "@/components/auth/v6/AuthV6Header";
import PasswordInput from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface LoginState {
  email: string;
  password: string;
  error: string;
  loading: boolean;
  showMagicLink: boolean;
  magicLinkSent: boolean;
  magicLinkLoading: boolean;
}

const initialLoginState: LoginState = {
  email: "",
  password: "",
  error: "",
  loading: false,
  showMagicLink: false,
  magicLinkSent: false,
  magicLinkLoading: false,
};

type LoginAction =
  | { type: "patch"; payload: Partial<LoginState> }
  | { type: "backToPassword" };

function loginReducer(state: LoginState, action: LoginAction): LoginState {
  if (action.type === "backToPassword") {
    return { ...state, showMagicLink: false, magicLinkSent: false, error: "" };
  }
  return { ...state, ...action.payload };
}

function safeCallbackPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

const authFieldClass =
  "rounded-[var(--radius-control)] border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]";

const authPrimaryButtonClass =
  "w-full rounded-[var(--radius-control)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-primary-hover)]";

const authTextLinkClass = "font-medium text-[var(--accent-primary-text)] hover:underline";

export default function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackPath(searchParams.get("callbackUrl"));
  const t = useTranslations("auth");
  const [state, dispatch] = useReducer(loginReducer, initialLoginState);
  const { email, password, error, loading, showMagicLink, magicLinkSent, magicLinkLoading } = state;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    dispatch({ type: "patch", payload: { error: "", loading: true } });

    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Invalid credentials");
      }

      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      dispatch({ type: "patch", payload: { error: err instanceof Error ? err.message : "Login failed" } });
    } finally {
      dispatch({ type: "patch", payload: { loading: false } });
    }
  }

  async function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    dispatch({ type: "patch", payload: { error: "", magicLinkLoading: true } });

    try {
      const { error: magicLinkError } = await authClient.signIn.magicLink({
        email,
        callbackURL: "/",
      });

      if (magicLinkError) {
        throw new Error(magicLinkError.message || t("genericError"));
      }

      dispatch({ type: "patch", payload: { magicLinkSent: true } });
    } catch (err) {
      dispatch({ type: "patch", payload: { error: err instanceof Error ? err.message : t("genericError") } });
    } finally {
      dispatch({ type: "patch", payload: { magicLinkLoading: false } });
    }
  }

  return (
    <AuthPageShell>
      <AuthCard>
        <div className="space-y-6">
          <AuthV6Header
            sectionLabel={t("v6.accessLabel")}
            title={t("welcomeBack")}
            subtitle={t("signInSubtitle")}
          />

          {showMagicLink ? (
            <form onSubmit={handleMagicLink} className="space-y-4">
              {error ? <AuthV6ErrorAlert>{error}</AuthV6ErrorAlert> : null}
              {magicLinkSent ? (
                <AuthV6SuccessAlert>{t("magicLinkSent")}</AuthV6SuccessAlert>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="magic-email" className="text-[var(--text-primary)]">
                      {t("email")}
                    </Label>
                    <Input
                      id="magic-email"
                      type="email"
                      autoComplete="email"
                      placeholder={t("emailPlaceholder")}
                      value={email}
                      onChange={(e) => dispatch({ type: "patch", payload: { email: e.target.value } })}
                      required
                      className={authFieldClass}
                    />
                  </div>
                  <Button type="submit" className={authPrimaryButtonClass} disabled={magicLinkLoading}>
                    {magicLinkLoading ? t("sendingMagicLink") : t("sendMagicLink")}
                  </Button>
                </>
              )}
              <p className="text-center text-sm text-[var(--text-secondary)]">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "backToPassword" })}
                  className={authTextLinkClass}
                >
                  {t("backToLogin")}
                </button>
              </p>
            </form>
          ) : (
            <>
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
                    onChange={(e) => dispatch({ type: "patch", payload: { email: e.target.value } })}
                    required
                    className={authFieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="login-password" className="text-[var(--text-primary)]">
                      {t("password")}
                    </Label>
                    <Link href="/forgot-password" className={cn("text-xs", authTextLinkClass)}>
                      {t("forgotPassword")}
                    </Link>
                  </div>
                  <PasswordInput
                    id="login-password"
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(value) => dispatch({ type: "patch", payload: { password: value } })}
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className={authPrimaryButtonClass} disabled={loading}>
                  {loading ? t("signingIn") : t("signIn")}
                </Button>
              </form>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "patch", payload: { showMagicLink: true, error: "" } })}
                  className={cn("text-sm", authTextLinkClass)}
                >
                  {t("magicLink")}
                </button>
              </div>

              <p className="text-center text-sm text-[var(--text-secondary)]">
                {t("noAccount")}{" "}
                <Link href="/signup" className={authTextLinkClass}>
                  {t("signUp")}
                </Link>
              </p>
            </>
          )}
        </div>
      </AuthCard>
    </AuthPageShell>
  );
}
