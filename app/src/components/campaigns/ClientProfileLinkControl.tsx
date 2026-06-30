"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUpdateCampaign } from "@/lib/hooks/use-campaigns";
import { useClientProfiles, useCreateClientProfile } from "@/lib/hooks/use-client-profiles";
import { useAppStore } from "@/lib/store";

export interface ClientProfileLinkControlProps {
  campaignId: string;
  clientName?: string | null;
  clientProfileId?: string | null;
  className?: string;
  variant?: "inline" | "banner";
}

export default function ClientProfileLinkControl({
  campaignId,
  clientName,
  clientProfileId,
  className,
  variant = "inline",
}: ClientProfileLinkControlProps) {
  const t = useTranslations("campaign.pilotSidebar");
  const addToast = useAppStore((s) => s.addToast);
  const { data: profiles = [], isLoading } = useClientProfiles();
  const updateCampaign = useUpdateCampaign(campaignId);
  const createProfile = useCreateClientProfile();
  const [draftClientName, setDraftClientName] = useState(clientName?.trim() ?? "");
  const selectedProfile = profiles.find((profile) => profile.id === clientProfileId);
  const isSaving = updateCampaign.isPending || createProfile.isPending;
  const needsProfileLink = !clientProfileId;
  const canCreateFromDraft = Boolean(draftClientName.trim());

  useEffect(() => {
    setDraftClientName(clientName?.trim() ?? "");
  }, [clientName]);

  const handleProfileChange = (value: string) => {
    updateCampaign.mutate(
      { clientProfileId: value === "none" ? null : value },
      {
        onSuccess: () => addToast("success", t("toastProfileLinked")),
        onError: (error) =>
          addToast(
            "error",
            error instanceof Error ? error.message : t("toastProfileLinkFailed")
          ),
      }
    );
  };

  const handleCreateProfile = () => {
    const name = draftClientName.trim();
    if (!name) return;

    createProfile.mutate(
      { name },
      {
        onSuccess: (profile) => {
          updateCampaign.mutate(
            { clientProfileId: profile.id, client: name },
            {
              onSuccess: () => addToast("success", t("toastProfileCreatedAndLinked")),
              onError: (error) =>
                addToast(
                  "error",
                  error instanceof Error ? error.message : t("toastProfileCreatedLinkFailed")
                ),
            }
          );
        },
        onError: (error) =>
          addToast(
            "error",
            error instanceof Error ? error.message : t("toastProfileCreateFailed")
          ),
      }
    );
  };

  if (!needsProfileLink && selectedProfile) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)]">
            {t("clientProfileLabel")}
          </p>
          <span className="rounded-full bg-[var(--accent-green-dim)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-green-text)]">
            {t("linkedBadge")}
          </span>
        </div>
        <select
          value={clientProfileId ?? "none"}
          disabled={isLoading || isSaving}
          onChange={(event) => handleProfileChange(event.target.value)}
          aria-label={t("clientProfileLabel")}
          className="h-9 w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 text-xs text-[var(--text-primary)] transition-colors disabled:opacity-60"
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const containerClass =
    variant === "banner"
      ? "rounded-lg border border-[var(--accent-green)]/40 bg-[var(--accent-green-dim)] px-4 py-4 space-y-3"
      : "space-y-3";

  return (
    <div className={cn(containerClass, className)} role="group" aria-labelledby="client-profile-link-title">
      <div>
        <h4
          id="client-profile-link-title"
          className="text-sm font-semibold text-[var(--text-primary)]"
        >
          {t("newClientTitle")}
        </h4>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {t("newClientDescription")}
        </p>
      </div>

      {profiles.length > 0 ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            {t("existingClientLabel")}
          </label>
          <select
            value={clientProfileId ?? "none"}
            disabled={isLoading || isSaving}
            onChange={(event) => handleProfileChange(event.target.value)}
            aria-label={t("existingClientLabel")}
            className={cn(
              "h-9 w-full rounded-md border bg-[var(--surface-base)] px-2 text-xs text-[var(--text-primary)] transition-colors disabled:opacity-60",
              "border-[var(--accent-green)]/60 focus:border-[var(--accent-green)] focus:ring-2 focus:ring-[var(--accent-green-dim)]"
            )}
          >
            <option value="none">{t("noProfileLinked")}</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor={`client-profile-name-${campaignId}`} className="block text-xs font-medium text-[var(--text-secondary)]">
          {t("clientNameLabel")}
        </label>
        <Input
          id={`client-profile-name-${campaignId}`}
          value={draftClientName}
          onChange={(event) => setDraftClientName(event.target.value)}
          placeholder={t("clientNamePlaceholder")}
          disabled={isSaving}
          className="h-9 bg-[var(--surface-base)] text-sm"
        />
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!canCreateFromDraft || isSaving}
          onClick={handleCreateProfile}
          className="gap-1.5"
        >
          {isSaving ? (
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          ) : (
            <UserPlus size={12} aria-hidden="true" />
          )}
          {isSaving ? t("saving") : t("createClientProfile")}
        </Button>
      </div>

      <p className="text-[11px] leading-snug text-[var(--text-muted)]">{t("profileLinkHelp")}</p>
    </div>
  );
}
