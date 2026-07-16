"use client";

import { useTranslations } from "next-intl";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";

export default function ActiveBrandSwitcher() {
  const t = useTranslations("navigation");
  const {
    profiles,
    activeProfile,
    activeClientProfileId,
    isLoading,
    selectProfile,
  } = useActiveClientProfile();

  if (isLoading || profiles.length === 0) return null;

  if (profiles.length === 1) {
    return (
      <div
        aria-label={t("activeBrand")}
        className="mt-3 truncate rounded-[var(--radius-control)] bg-[var(--surface-base)] px-3 py-2 text-center text-xs font-medium text-[var(--text-primary)]"
      >
        {activeProfile?.name ?? profiles[0].name}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <label className="sr-only" htmlFor="active-brand-switcher">
        {t("activeBrand")}
      </label>
      <select
        id="active-brand-switcher"
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
