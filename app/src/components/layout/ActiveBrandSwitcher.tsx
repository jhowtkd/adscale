"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import AssistantCreateClientDialog from "@/components/assistant/AssistantCreateClientDialog";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { useDeleteClientProfile } from "@/lib/hooks/use-client-profiles";
import { cn } from "@/lib/utils";

const NEW_BRAND_VALUE = "__new_brand__";

export default function ActiveBrandSwitcher({
  id = "active-brand-switcher",
  className,
}: {
  id?: string;
  className?: string;
} = {}) {
  const t = useTranslations("navigation");
  const {
    profiles,
    activeProfile,
    activeClientProfileId,
    isLoading,
    selectProfile,
  } = useActiveClientProfile();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const deleteProfile = useDeleteClientProfile();

  if (isLoading) return null;

  const handleChange = (value: string) => {
    if (value === NEW_BRAND_VALUE) {
      setCreateDialogOpen(true);
      return;
    }
    selectProfile(value);
  };

  return (
    <>
      <div className={cn("mt-3 flex items-center gap-1", className)}>
        <label className="sr-only" htmlFor={id}>
          {t("activeBrand")}
        </label>
        <select
          id={id}
          value={activeClientProfileId ?? ""}
          onChange={(event) => handleChange(event.target.value)}
          className="block min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 py-2 text-xs font-medium text-[var(--text-primary)] focus-visible:border-[var(--focus-ring)] focus-visible:outline-none"
        >
          {!activeClientProfileId ? (
            <option value="" disabled>
              {t("selectBrand")}
            </option>
          ) : null}
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
          <option value={NEW_BRAND_VALUE}>{t("newBrand")}</option>
        </select>
        {activeProfile ? (
          <button
            type="button"
            aria-label={t("deleteBrand")}
            title={t("deleteBrand")}
            onClick={() => setDeleteDialogOpen(true)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-control)] text-[var(--text-muted)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <AssistantCreateClientDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={selectProfile}
        labels={{
          title: t("newBrandTitle"),
          description: t("newBrandDescription"),
          nameLabel: t("brandName"),
          namePlaceholder: t("brandNamePlaceholder"),
          submit: t("createBrand"),
        }}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t("deleteBrandTitle")}
        description={t("deleteBrandDescription", { name: activeProfile?.name ?? "" })}
        confirmLabel={t("deleteBrandConfirm")}
        isLoading={deleteProfile.isPending}
        onConfirm={() => {
          if (!activeClientProfileId) return;
          deleteProfile.mutate(activeClientProfileId, {
            onSuccess: () => toast.success(t("brandDeleted")),
            onError: (error) => toast.error(error.message),
          });
        }}
      />
    </>
  );
}
