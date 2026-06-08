"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import AuthCard from "@/components/auth/AuthCard";
import AuthPageShell from "@/components/auth/AuthPageShell";
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
    <AuthPageShell>
      <AuthCard>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{t("loading")}</h1>
        </div>
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
    <AuthPageShell>
      <AuthCard>
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("inviteTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("inviteSubtitle")}
            </p>
          </div>

          {status === "loading" && (
            <div className="text-center text-sm text-muted-foreground">
              {t("processingInvite")}
            </div>
          )}

          {status === "success" && (
            <div className="space-y-4">
              <div className="rounded-md bg-[var(--accent-green)]/10 px-3 py-2 text-sm text-[var(--accent-green-text)]">
                {t("inviteSuccess")}
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {t("redirecting")}
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={() => router.push("/login")}>
                  {t("backToSignIn")}
                </Button>
                {token && (
	                  <Button
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
