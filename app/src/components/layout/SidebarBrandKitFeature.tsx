"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { protocolShineFill } from "@/components/dashboard/studio-stage/ProtocolRadios";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { useBrandTrainingStatus, type BrandTrainingStatus } from "@/lib/hooks/use-brand-training";

export default function SidebarBrandKitFeature() {
  const tNav = useTranslations("navigation");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    activeClientProfileId,
    activeProfile,
    requiresSelection,
    isLoading: profilesLoading,
    isError: profilesError,
  } = useActiveClientProfile();
  const { data: training, isError: trainingError } = useBrandTrainingStatus(activeClientProfileId);
  const settingsTab = searchParams.get("tab");
  const isActive =
    pathname.startsWith("/brand-kit") ||
    (pathname.startsWith("/settings") &&
      (settingsTab === "brandKit" || settingsTab === "brandTraining"));
  const status = brandKitSidebarStatus({
    profilesLoading,
    profilesError,
    trainingError,
    activeClientProfileId,
    training,
    requiresSelection,
  });

  return (
    <Link
      href="/brand-kit"
      data-testid="sidebar-brand-kit-feature"
      className={cn(
        "block rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] transition-colors",
        "hover:border-[var(--selection-border)] hover:bg-[var(--surface-base)]",
        isActive && "border-[var(--selection-border)] bg-[var(--selection-bg)]"
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <span
        className={cn(
          "flex flex-col gap-0.5 rounded-[calc(var(--radius-control)-1px)] px-3 py-2.5",
          isActive && "text-[var(--selection-text)]"
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[#0a0a0a]"
            style={protocolShineFill}
          >
            {tNav("cortexLabel")}
          </span>
        </span>
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          {activeProfile?.name ?? tNav("brands")}
        </span>
        <span className="text-[11px] text-[var(--text-muted)]">
          {status === "loading"
            ? tNav("brandKitStatusLoading")
            : status === "unavailable"
              ? tNav("brandKitStatusUnavailable")
              : tNav(status)}
        </span>
      </span>
    </Link>
  );
}

export function brandStatusKey(
  activeClientProfileId: string | null,
  training?: BrandTrainingStatus,
  requiresSelection = false,
) {
  if (requiresSelection) return "brandKitStatusSetup";
  if (!activeClientProfileId) return "brandKitStatusSelect";
  if (training?.needsReview) return "brandKitStatusReview";
  return training?.trained ? "brandKitStatusReady" : "brandKitStatusSetup";
}

export function brandKitSidebarStatus(input: {
  profilesLoading: boolean;
  profilesError: boolean;
  trainingError: boolean;
  activeClientProfileId: string | null;
  training?: BrandTrainingStatus;
  requiresSelection?: boolean;
}): "loading" | "unavailable" | ReturnType<typeof brandStatusKey> {
  if (input.profilesLoading) return "loading";
  if (input.profilesError || input.trainingError) return "unavailable";
  return brandStatusKey(
    input.activeClientProfileId,
    input.training,
    input.requiresSelection,
  );
}
