"use client";

import { useTranslations } from "next-intl";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { cn } from "@/lib/utils";

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

  if (isLoading || profiles.length === 0) return null;

  return (
    <div className={cn("mt-3", className)}>
      <label className="sr-only" htmlFor={id}>
        {t("activeBrand")}
      </label>
      <select
        id={id}
        value={activeClientProfileId ?? ""}
        onChange={(event) => selectProfile(event.target.value)}
        className="block w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 py-2 text-xs font-medium text-[var(--text-primary)] focus-visible:border-[var(--accent-primary)] focus-visible:outline-none"
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
      </select>
    </div>
  );
}
