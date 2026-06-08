"use client";

import { useReducer } from "react";
import AuthCard from "@/components/auth/AuthCard";
import AuthPageShell from "@/components/auth/AuthPageShell";
import PasswordInput from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";

interface SignupState {
  name: string;
  email: string;
  password: string;
  consent: boolean;
  error: string;
  loading: boolean;
}

const initialSignupState: SignupState = {
  name: "",
  email: "",
  password: "",
  consent: false,
  error: "",
  loading: false,
};

function signupReducer(state: SignupState, payload: Partial<SignupState>): SignupState {
  return { ...state, ...payload };
}

export default function SignupContent() {
  const router = useRouter();
  const t = useTranslations("auth");
  const [state, dispatch] = useReducer(signupReducer, initialSignupState);
  const { name, email, password, consent, error, loading } = state;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    dispatch({ error: "" });

    if (!consent) {
      dispatch({ error: "Voce precisa aceitar os Termos de Uso e a Politica de Privacidade para continuar." });
      return;
    }

    dispatch({ loading: true });

    try {
      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Signup failed");
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      dispatch({ error: err instanceof Error ? err.message : "Signup failed" });
    } finally {
      dispatch({ loading: false });
    }
  }

  return (
    <AuthPageShell>
      <AuthCard>
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{t("createAccountTitle")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("signUpSubtitle")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">{t("name")}</Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                placeholder={t("namePlaceholder")}
                value={name}
	                onChange={(e) => dispatch({ name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                value={email}
	                onChange={(e) => dispatch({ email: e.target.value })}
                required
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
            <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={consent}
	                onChange={(e) => dispatch({ consent: e.target.checked })}
                className="mt-0.5 accent-[var(--accent-green)]"
              />
              <span>
                Eu concordo com os{" "}
                <Link href="/terms" className="text-[var(--accent-green)] hover:underline p-1" target="_blank">
                  Termos de Uso
                </Link>{" "}
                e a{" "}
                <Link href="/privacy" className="text-[var(--accent-green)] hover:underline p-1" target="_blank">
                  Politica de Privacidade
                </Link>
                .
              </span>
            </label>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("creatingAccount") : t("signUp")}
            </Button>
          </form>

          <SocialAuthButtons mode="signup" />

          <p className="text-center text-sm text-muted-foreground">
            {t("hasAccount")}{" "}
                <Link href="/login" className="underline hover:text-primary p-1">
                  {t("signIn")}
                </Link>
          </p>
        </div>
      </AuthCard>
    </AuthPageShell>
  );
}
