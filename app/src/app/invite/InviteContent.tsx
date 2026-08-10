"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AuthCard from "@/components/auth/AuthCard";
import AuthPageShell from "@/components/auth/AuthPageShell";
import { AuthV6ErrorAlert, AuthV6SuccessAlert } from "@/components/auth/v6/AuthV6Alert";
import AuthV6Header from "@/components/auth/v6/AuthV6Header";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { relativeCallbackPath } from "@/lib/auth-callback";

class InviteRequestError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

type InvitePreview = {
  invite: {
    workspaceName: string;
    role: string;
    senderName: string | null;
    recipientEmail: string;
    expiresAt: string;
  };
  account: { email: string; matchesInvite: boolean } | null;
};

async function requestInvite(path: string, token: string, signal?: AbortSignal) {
  const isPreview = path === "/api/workspace/invites";
  const url = isPreview ? `${path}?${new URLSearchParams({ token })}` : path;
  const res = await fetch(url, {
    method: isPreview ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(isPreview ? {} : { body: JSON.stringify({ token }) }),
    signal,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    throw new InviteRequestError(data.error || "Invite request failed", data.code);
  }
  return res.json();
}

async function loadInvitePreview(token: string, signal?: AbortSignal): Promise<InvitePreview> {
  return requestInvite("/api/workspace/invites", token, signal) as Promise<InvitePreview>;
}

async function acceptInvite(token: string, signal?: AbortSignal) {
  await requestInvite("/api/workspace/invites/accept", token, signal);
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

function inviteErrorMessage(error: unknown, t: ReturnType<typeof useTranslations<"auth">>) {
  const code = error instanceof InviteRequestError ? error.code : undefined;
  if (code === "inviteNotFound") return t("invalidToken");
  if (code === "inviteExpired") return t("inviteExpired");
  if (code === "inviteRemoved") return t("inviteRemoved");
  if (code === "inviteAlreadyAccepted") return t("inviteAlreadyAccepted");
  if (code === "inviteEmailMismatch") return t("inviteEmailMismatch");
  if (error instanceof Error && error.name === "AbortError") return t("inviteTimeout");
  return error instanceof Error ? error.message : t("genericError");
}

function InviteContentInner() {
  const t = useTranslations("auth");
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const previewQuery = useQuery({
    queryKey: ["invite-preview", token],
    enabled: Boolean(token),
    retry: false,
    queryFn: ({ signal }) => loadInvitePreview(token!, signal),
  });
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
      setTimeout(() => window.location.assign("/"), 2000);
    },
  });

  const goToLogin = () => {
    const loginUrl = new URL("/login", window.location.href);
    loginUrl.searchParams.set("callbackUrl", relativeCallbackPath(window.location));
    window.location.assign(loginUrl.toString());
  };
  const goBack = () => router.push("/");
  const accountMatchesInvite = previewQuery.data?.account?.matchesInvite === true;
  const status = !token
    ? "error"
    : acceptInviteMutation.isSuccess
      ? "success"
      : previewQuery.isError || acceptInviteMutation.isError
        ? "error"
        : sessionLoading || previewQuery.isPending || acceptInviteMutation.isPending
          ? "loading"
          : "ready";
  const currentError = acceptInviteMutation.error ?? previewQuery.error;
  const error = !token ? t("invalidToken") : inviteErrorMessage(currentError, t);
  const canSwitchAccount = currentError instanceof InviteRequestError && currentError.code === "inviteEmailMismatch";

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
            <div role="status" aria-live="polite" className="text-center text-sm text-[var(--text-secondary)]">{t("processingInvite")}</div>
          )}

          {status === "success" && (
            <div aria-live="polite" className="space-y-4">
              <AuthV6SuccessAlert>{t("inviteSuccess")}</AuthV6SuccessAlert>
              <p className="text-center text-sm text-[var(--text-secondary)]">
                {t("inviteDestination", { workspace: previewQuery.data?.invite.workspaceName ?? "ADScale" })}
              </p>
              <p className="text-center text-sm text-[var(--text-secondary)]">{t("redirecting")}</p>
            </div>
          )}

          {status === "ready" && previewQuery.data ? (
            <div className="space-y-5" aria-live="polite">
              <section className="rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4" aria-labelledby="invite-context-title">
                <h2 id="invite-context-title" className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("inviteWorkspaceLabel")}: {previewQuery.data.invite.workspaceName}
                </h2>
                <dl className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                  <div className="flex justify-between gap-4"><dt>{t("inviteRoleLabel")}</dt><dd>{previewQuery.data.invite.role}</dd></div>
                  <div className="flex justify-between gap-4"><dt>{t("inviteRecipientLabel")}</dt><dd className="text-right">{previewQuery.data.invite.recipientEmail}</dd></div>
                  {previewQuery.data.invite.senderName ? <div className="flex justify-between gap-4"><dt>{t("inviteSenderLabel")}</dt><dd className="text-right">{previewQuery.data.invite.senderName}</dd></div> : null}
                </dl>
              </section>
              {session ? (
                <p className={`text-sm ${accountMatchesInvite ? "text-[var(--text-secondary)]" : "text-[var(--danger-text)]"}`}>
                  {accountMatchesInvite ? t("inviteAccount", { email: session.user.email }) : t("inviteWrongAccount", { email: session.user.email })}
                </p>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">{t("inviteSignInToContinue")}</p>
              )}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={goBack}>{t("backToAdscale")}</Button>
                <Button
                  className="rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)]"
                  onClick={() => (accountMatchesInvite ? acceptInviteMutation.mutate(token!) : goToLogin())}
                >
                  {accountMatchesInvite ? t("acceptInvite") : session ? t("switchAccount") : t("signInToAccept")}
                </Button>
              </div>
            </div>
          ) : null}

          {status === "error" && (
            <div className="space-y-4" aria-live="assertive">
              <AuthV6ErrorAlert>{error}</AuthV6ErrorAlert>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
                <Button variant="outline" onClick={goBack}>{t("backToAdscale")}</Button>
                {canSwitchAccount ? (
                  <Button onClick={goToLogin}>{t("switchAccount")}</Button>
                ) : previewQuery.isError ? (
                  <Button onClick={() => previewQuery.refetch()}>{t("retry")}</Button>
                ) : acceptInviteMutation.isError ? (
                  <Button onClick={() => { acceptInviteMutation.reset(); acceptInviteMutation.mutate(token!); }}>{t("retry")}</Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </AuthCard>
    </AuthPageShell>
  );
}
