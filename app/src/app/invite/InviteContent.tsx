"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import AuthCard from "@/components/auth/AuthCard";
import AuthPageShell from "@/components/auth/AuthPageShell";
import { AuthV6ErrorAlert, AuthV6SuccessAlert } from "@/components/auth/v6/AuthV6Alert";
import AuthV6Header from "@/components/auth/v6/AuthV6Header";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

async function acceptInvite(token: string, signal?: AbortSignal) {
  const res = await fetch("/api/workspace/invites/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    signal,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new Error(data.error || "Não foi possível aceitar o convite.");
  }
}

export default function InviteContent() {
  return (
    <Suspense fallback={<InviteLoading />}>
      <InviteContentInner />
    </Suspense>
  );
}

function InviteLoading() {
  const t = useTranslations("auth");

  return (
    <AuthPageShell showBranding={false}>
      <AuthCard>
        <AuthV6Header sectionLabel={t("v6.accessLabel")} title={t("loading")} subtitle="" showLogo />
      </AuthCard>
    </AuthPageShell>
  );
}

function InviteContentInner() {
  const t = useTranslations("auth");
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const hasStartedRef = useRef(false);

  const { data: session, isPending: sessionLoading } = authClient.useSession();

  const acceptInviteMutation = useMutation({
    mutationFn: async (inviteToken: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        await acceptInvite(inviteToken, controller.signal);
      } finally {
        clearTimeout(timeoutId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
      setTimeout(() => {
        window.location.assign("/");
      }, 2000);
    },
  });

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) {
      const loginUrl = new URL("/login", window.location.href);
      loginUrl.searchParams.set("callbackUrl", window.location.href);
      window.location.assign(loginUrl.toString());
      return;
    }

    if (!token) return;

    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    acceptInviteMutation.mutate(token);
  }, [acceptInviteMutation, session, sessionLoading, token]);

  const status = !sessionLoading && session && !token
    ? "error"
    : acceptInviteMutation.isSuccess
      ? "success"
      : acceptInviteMutation.isError
        ? "error"
        : "loading";
  const error = !token
    ? t("invalidToken")
    : acceptInviteMutation.error instanceof Error
      ? acceptInviteMutation.error.message
      : t("genericError");

  return (
    <AuthPageShell showBranding={false}>
      <AuthCard>
        <div className="space-y-6">
          <AuthV6Header
            sectionLabel={t("v6.accessLabel")}
            title={t("inviteTitle")}
            subtitle={t("inviteSubtitle")}
            showLogo
          />

          {status === "loading" && (
            <div className="text-center text-sm text-[var(--text-secondary)]">{t("processingInvite")}</div>
          )}

          {status === "success" && (
            <div className="space-y-4">
              <AuthV6SuccessAlert>{t("inviteSuccess")}</AuthV6SuccessAlert>
              <p className="text-center text-sm text-[var(--text-secondary)]">{t("redirecting")}</p>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <AuthV6ErrorAlert>{error}</AuthV6ErrorAlert>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={() => router.push("/login")}>
                  {t("backToSignIn")}
                </Button>
                {token && (
                  <Button
                    className="rounded-[var(--radius-control)] bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
                    onClick={() => {
                      hasStartedRef.current = true;
                      acceptInviteMutation.reset();
                      acceptInviteMutation.mutate(token);
                    }}
                  >
                    {t("retry")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </AuthCard>
    </AuthPageShell>
  );
}
