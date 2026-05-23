"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AuthCard from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

function InviteContent() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const { data: session, isPending: sessionLoading } = authClient.useSession();

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) {
      const loginUrl = new URL("/login", window.location.href);
      loginUrl.searchParams.set("callbackUrl", window.location.href);
      router.push(loginUrl.toString());
      return;
    }

    async function accept() {
      if (!token) {
        setStatus("error");
        setError(t("invalidToken"));
        return;
      }

      setStatus("loading");
      try {
        const res = await fetch("/api/workspace/invites/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
          throw new Error(data.error || t("genericError"));
        }

        setStatus("success");
        setTimeout(() => {
          router.push("/");
        }, 2000);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : t("genericError"));
      }
    }

    accept();
  }, [session, sessionLoading, token, router, t]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--deep-bg)] px-4">
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
              <div className="rounded-md bg-[var(--accent-mint)]/10 px-3 py-2 text-sm text-[var(--accent-mint)]">
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
                  {t("backToLogin")}
                </Button>
                {token && (
                  <Button
                    onClick={() => {
                      setStatus("idle");
                      setError("");
                      window.location.reload();
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
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--deep-bg)] px-4">
          <AuthCard>
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Loading...</h1>
            </div>
          </AuthCard>
        </div>
      }
    >
      <InviteContent />
    </Suspense>
  );
}
