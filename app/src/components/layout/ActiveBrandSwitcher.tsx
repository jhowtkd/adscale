"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import AssistantCreateClientDialog from "@/components/assistant/AssistantCreateClientDialog";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
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
    activeClientProfileId,
    isLoading,
    selectProfile,
  } = useActiveClientProfile();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

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
      <div className={cn("mt-3", className)}>
        <label className="sr-only" htmlFor={id}>
          {t("activeBrand")}
        </label>
        <select
          id={id}
          value={activeClientProfileId ?? ""}
          onChange={(event) => handleChange(event.target.value)}
          className="block w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 py-2 text-xs font-medium text-[var(--text-primary)] focus-visible:border-[var(--focus-ring)] focus-visible:outline-none"
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
    </>
  );
}
