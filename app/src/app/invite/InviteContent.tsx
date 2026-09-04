"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AuthCard from "@/components/auth/AuthCard";
import AuthPageShell from "@/components/auth/AuthPageShell";
import {
  authPrimaryButtonClass,
  authQuietButtonClass,
  authRowClass,
} from "@/components/auth/auth-chrome";
import { AuthV6ErrorAlert, AuthV6SuccessAlert } from "@/components/auth/v6/AuthV6Alert";
import AuthV6Header from "@/components/auth/v6/AuthV6Header";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { relativeCallbackPath } from "@/lib/auth-callback";
import { cn } from "@/lib/utils";

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

type InviteAcceptance = { success: true; workspaceId: string };
const INVITE_REQUEST_TIMEOUT_MS = 15_000;

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
  return requestInviteWithTimeout("/api/workspace/invites", token, signal) as Promise<InvitePreview>;
}

async function acceptInvite(token: string, signal?: AbortSignal): Promise<InviteAcceptance> {
  return requestInviteWithTimeout("/api/workspace/invites/accept", token, signal) as Promise<InviteAcceptance>;
}

async function requestInviteWithTimeout(path: string, token: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INVITE_REQUEST_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromParent, { once: true });
  try {
    return await requestInvite(path, token, controller.signal);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")
  );
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
        <AuthV6Header sectionLabel={t("v6.accessLabel")} title={t("loading")} subtitle="" />
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
  if (isAbortError(error)) return t("inviteTimeout");
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
    mutationFn: (inviteToken: string) => acceptInvite(inviteToken),
    onSuccess: (accepted) => {
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
      setTimeout(() => window.location.assign(`/?workspaceId=${encodeURIComponent(accepted.workspaceId)}`), 2000);
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
  const isTimeout = isAbortError(currentError);
  const canSwitchAccount = isTimeout || (currentError instanceof InviteRequestError && currentError.code === "inviteEmailMismatch");

  return (
    <AuthPageShell showBranding={false}>
      <AuthCard>
        <div className="space-y-6">
          <AuthV6Header
            sectionLabel={t("v6.accessLabel")}
            title={t("inviteTitle")}
            subtitle={t("inviteSubtitle")}
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
              <section aria-labelledby="invite-context-title">
                <h2 id="invite-context-title" className="text-sm font-medium text-[var(--text-primary)]">
                  {t("inviteWorkspaceLabel")}: {previewQuery.data.invite.workspaceName}
                </h2>
                <dl className="text-sm text-[var(--text-secondary)]">
                  <div className={authRowClass}>
                    <dt>{t("inviteRoleLabel")}</dt>
                    <dd>{previewQuery.data.invite.role}</dd>
                  </div>
                  <div className={authRowClass}>
                    <dt>{t("inviteRecipientLabel")}</dt>
                    <dd className="text-right">{previewQuery.data.invite.recipientEmail}</dd>
                  </div>
                  {previewQuery.data.invite.senderName ? (
                    <div className={authRowClass}>
                      <dt>{t("inviteSenderLabel")}</dt>
                      <dd className="text-right">{previewQuery.data.invite.senderName}</dd>
                    </div>
                  ) : null}
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
                <button type="button" className={cn(authQuietButtonClass, "w-full sm:w-auto")} onClick={goBack}>
                  {t("backToAdscale")}
                </button>
                <button
                  type="button"
                  className={cn(authPrimaryButtonClass, "sm:w-auto")}
                  onClick={() => (accountMatchesInvite ? acceptInviteMutation.mutate(token!) : goToLogin())}
                >
                  {accountMatchesInvite ? t("acceptInvite") : session ? t("switchAccount") : t("signInToAccept")}
                </button>
              </div>
            </div>
          ) : null}

          {status === "error" && (
            <div className="space-y-4" aria-live="assertive">
              <AuthV6ErrorAlert>{error}</AuthV6ErrorAlert>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
                <button type="button" className={cn(authQuietButtonClass, "w-full sm:w-auto")} onClick={goBack}>
                  {t("backToAdscale")}
                </button>
                {canSwitchAccount ? (
                  <button type="button" className={cn(authPrimaryButtonClass, "sm:w-auto")} onClick={goToLogin}>
                    {t("switchAccount")}
                  </button>
                ) : null}
                {isTimeout ? (
                  <button
                    type="button"
                    className={cn(authPrimaryButtonClass, "sm:w-auto")}
                    onClick={() => {
                      if (previewQuery.isError) {
                        void previewQuery.refetch();
                      } else {
                        acceptInviteMutation.reset();
                        acceptInviteMutation.mutate(token!);
                      }
                    }}
                  >
                    {t("retry")}
                  </button>
                ) : !canSwitchAccount && previewQuery.isError ? (
                  <button
                    type="button"
                    className={cn(authPrimaryButtonClass, "sm:w-auto")}
                    onClick={() => previewQuery.refetch()}
                  >
                    {t("retry")}
                  </button>
                ) : !canSwitchAccount && acceptInviteMutation.isError ? (
                  <button
                    type="button"
                    className={cn(authPrimaryButtonClass, "sm:w-auto")}
                    onClick={() => {
                      acceptInviteMutation.reset();
                      acceptInviteMutation.mutate(token!);
                    }}
                  >
                    {t("retry")}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </AuthCard>
    </AuthPageShell>
  );
}
