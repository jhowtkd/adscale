"use client";

import { useReducer } from "react";
import AuthCard from "@/components/auth/AuthCard";
import PasswordInput from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import { authClient } from "@/lib/auth-client";

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

export default function LoginContent() {
  const router = useRouter();
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

      router.push("/");
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
    <main className="flex min-h-screen items-center justify-center bg-[var(--deep-bg)] px-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 dot-grid opacity-50" />
      <div className="absolute top-1/4 left-1/4 size-[500px] bg-[var(--accent-green)]/[0.02] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 size-[400px] bg-[var(--accent-green)]/[0.01] rounded-full blur-[100px] pointer-events-none" />
      <AuthCard>
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{t("welcomeBack")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("signInSubtitle")}
            </p>
          </div>

          {showMagicLink ? (
            <form onSubmit={handleMagicLink} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              {magicLinkSent ? (
                <div className="rounded-md bg-[var(--accent-green)]/10 px-3 py-2 text-sm text-[var(--accent-green)]">
                  {t("magicLinkSent")}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="magic-email">{t("email")}</Label>
                    <Input
                      id="magic-email"
                      type="email"
                      autoComplete="email"
                      placeholder={t("emailPlaceholder")}
                      value={email}
	                      onChange={(e) => dispatch({ type: "patch", payload: { email: e.target.value } })}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={magicLinkLoading}>
                    {magicLinkLoading ? t("sendingMagicLink") : t("sendMagicLink")}
                  </Button>
                </>
              )}
              <p className="text-center text-sm text-muted-foreground">
                <button
                  type="button"
	                  onClick={() => {
	                    dispatch({ type: "backToPassword" });
	                  }}
                  className="underline hover:text-primary"
                >
                  {t("backToLogin")}
                </button>
              </p>
            </form>
          ) : (
            <>
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
	                    onChange={(e) => dispatch({ type: "patch", payload: { email: e.target.value } })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">{t("password")}</Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-[var(--text-secondary)] underline hover:text-primary py-2 px-1 -mx-1"
                    >
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
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("signingIn") : t("signIn")}
                </Button>
              </form>

              <SocialAuthButtons mode="login" />

              <div className="space-y-3 text-center">
                <button
                  type="button"
	                  onClick={() => {
	                    dispatch({ type: "patch", payload: { showMagicLink: true, error: "" } });
	                  }}
                  className="text-sm text-[var(--text-secondary)] underline hover:text-primary py-2 px-1"
                >
                  {t("magicLink")}
                </button>
              </div>

              <p className="text-center text-sm text-muted-foreground">
                {t("noAccount")}{" "}
                <Link href="/signup" className="underline hover:text-primary p-1">
                  {t("signUp")}
                </Link>
              </p>
            </>
          )}
        </div>
      </AuthCard>
    </main>
  );
}
