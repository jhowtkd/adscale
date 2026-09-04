"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AssistantCreateClientDialog from "@/components/assistant/AssistantCreateClientDialog";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { studioChipClass } from "@/components/dashboard/studio-stage/StudioInstrument";
import { useDeleteClientProfile } from "@/lib/hooks/use-client-profiles";
import { cn } from "@/lib/utils";

const NEW_BRAND_VALUE = "__new_brand__";

export default function ActiveBrandSwitcher({
  id = "active-brand-switcher",
  className,
  variant = "field",
}: {
  id?: string;
  className?: string;
  /** `grouped` is a TalkBox chip on the Palco top row. */
  variant?: "field" | "grouped";
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

  const grouped = variant === "grouped";

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        id={id}
        aria-label={t("activeBrand")}
        className={cn(
          grouped
            ? cn(studioChipClass, "max-w-full", className)
            : "flex h-full min-w-0 w-full appearance-none items-center gap-2 bg-transparent px-3 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]",
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {activeProfile?.name ?? t("selectBrand")}
        </span>
        <ChevronDown size={14} aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[12rem] border-[var(--border-subtle)] bg-[var(--surface-raised)]"
      >
        {profiles.map((profile) => (
          <DropdownMenuItem
            key={profile.id}
            onClick={() => handleChange(profile.id)}
            className={cn(profile.id === activeClientProfileId && "bg-white/6")}
          >
            {profile.name}
          </DropdownMenuItem>
        ))}
        {profiles.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onClick={() => handleChange(NEW_BRAND_VALUE)}>
          {t("newBrand")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      {grouped ? menu : (
        <div
          className={cn(
            "flex h-10 min-w-0 items-stretch overflow-hidden rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)]",
            className,
          )}
        >
          <div className="flex min-w-0 flex-1">{menu}</div>
          {activeProfile ? (
            <button
              type="button"
              aria-label={t("deleteBrand")}
              title={t("deleteBrand")}
              onClick={() => setDeleteDialogOpen(true)}
              className={cn(
                "grid w-10 shrink-0 place-items-center border-l border-[var(--border-default)] text-[var(--text-muted)]",
                "hover:bg-[var(--danger-bg)] hover:text-[var(--danger-text)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]",
              )}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      )}

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
