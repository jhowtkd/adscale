"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useCampaignCount } from "@/lib/hooks/use-campaigns";
import { useBillingStatus } from "@/lib/hooks/use-billing";
import { authClient } from "@/lib/auth-client";
import AccountStatusBadge from "@/components/layout/AccountStatusBadge";
import SidebarAssistantModeSwitch from "@/components/layout/SidebarAssistantModeSwitch";
import SidebarBrandKitFeature from "@/components/layout/SidebarBrandKitFeature";
import AppSidebarCampaignMap from "@/components/layout/AppSidebarCampaignMap";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { cn } from "@/lib/utils";

type AppSidebarVariant = "production" | "preview";

export default function AppSidebar({ variant = "production" }: { variant?: AppSidebarVariant }) {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations("navigation");
  const tLibrary = useTranslations("library");
  const tCommon = useTranslations("common");
  const user = useAppStore((s) => s.user);
  const billing = useAppStore((s) => s.billing);
  const { data: session } = authClient.useSession();
  const { count: totalCount } = useCampaignCount();
  const { data: billingStatus } = useBillingStatus();

  const isPreview = variant === "preview";
  const homeHref = isPreview ? "/v6" : "/";

  const displayName =
    session?.user?.name?.trim() || `${user.firstName} ${user.lastName}`.trim() || user.email;
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";
  const planLabel = billingStatus?.access?.label ?? billing.planName;
  const isTesterAccount = billingStatus?.access?.kind === "tester";
  const accessRole = billingStatus?.access?.role;
  const isOwnerOrAdmin = accessRole === "owner" || accessRole === "admin";

  const isDashboard = isPreview
    ? pathname === "/v6" || pathname.startsWith("/v6/dashboard") || pathname.startsWith("/v6/topbar-promo")
    : pathname === "/";
  const isCampaigns = isPreview
    ? pathname.startsWith("/v6/campaigns") || pathname.startsWith("/v6/campaign-workspace")
    : pathname.startsWith("/campaigns");
  const isLibrary = isPreview
    ? pathname.startsWith("/v6/library")
    : pathname.startsWith("/library");

  const campaignCount = isPreview ? "12" : totalCount > 0 ? String(totalCount) : undefined;

  const handleLogout = () => {
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => router.push("/login"),
      },
    });
  };

  return (
    <aside className="v6-shell-sidebar relative" aria-label="Navegação principal">
      <GlowingEffect
        spread={40}
        glow
        disabled={false}
        proximity={64}
        inactiveZone={0.01}
        borderWidth={2}
      />
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-1">
      <div className="mb-2.5 shrink-0 border-b border-[var(--border-subtle)] px-2 pb-4 pt-2">
        <Link href={homeHref} className="flex w-full justify-center rounded-md py-0.5" aria-label="ADScale">
          <Image
            src="/images/logo.svg"
            alt=""
            aria-hidden="true"
            className="v6-sidebar-logo block h-[22px] w-auto max-w-[130px]"
            width={813}
            height={142}
            priority
            unoptimized
          />
        </Link>
      </div>

      {!isPreview ? (
        <div className="mb-3 shrink-0 px-1">
          <Suspense fallback={null}>
            <SidebarAssistantModeSwitch />
          </Suspense>
        </div>
      ) : null}

      <nav
        className="mb-3 grid shrink-0 grid-cols-4 gap-1"
        aria-label={tNav("sectionPrincipal")}
      >
        <IconNavItem
          href={isPreview ? "/v6/dashboard" : "/"}
          active={isDashboard}
          label={tNav("dashboard")}
          icon={LayoutDashboard}
        />
        <IconNavItem
          href={isPreview ? "/v6/campaigns" : "/campaigns"}
          active={isCampaigns}
          label={tNav("campaigns")}
          icon={FolderOpen}
          count={campaignCount}
        />
        <IconNavItem
          href={isPreview ? "/v6/library" : "/library"}
          active={isLibrary}
          label={tLibrary("title")}
          icon={BookOpen}
        />
        <IconNavItem
          href={isPreview ? "#" : "/campaigns?new=1"}
          active={false}
          label={tCommon("create")}
          icon={Plus}
        />
      </nav>

      {!isPreview ? (
        <div className="mb-3 shrink-0 px-1">
          <Suspense fallback={null}>
            <SidebarBrandKitFeature />
          </Suspense>
        </div>
      ) : null}

      {!isPreview ? (
        <div className="min-h-0 flex-1 overflow-hidden border-t border-[var(--border-subtle)] pt-2">
          <AppSidebarCampaignMap />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {isOwnerOrAdmin && (
        <div className="mt-2 shrink-0 border-t border-[var(--border-subtle)] pt-2">
          <TextNavItem
            href="/feedback"
            active={pathname.startsWith("/feedback")}
            label={tNav("feedback")}
          />
        </div>
      )}

      <div className="mt-auto shrink-0 border-t border-[var(--border-subtle)] pt-3">
        <Link
          href={isPreview ? "#" : "/settings"}
          className="flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-2 transition-colors hover:bg-[var(--surface-base)]"
        >
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--neutral-bg)] text-[11px] font-bold text-[var(--text-primary)]">
            {initials}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{displayName}</p>
              {isTesterAccount ? <AccountStatusBadge variant="tester" /> : null}
            </div>
            {!isTesterAccount ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {planLabel}
              </p>
            ) : null}
          </div>
        </Link>
        {!isPreview ? (
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-base)] hover:text-[var(--accent-rose)]"
          >
            <LogOut size={16} aria-hidden="true" className="shrink-0" />
            <span>{tNav("logout")}</span>
          </button>
        ) : null}
      </div>
      </div>
    </aside>
  );
}

function IconNavItem({
  href,
  label,
  icon: Icon,
  active,
  count,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  count?: string;
}) {
  return (
    <Link
      href={href}
      title={count ? `${label} (${count})` : label}
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-[var(--radius-control)] px-1 py-2 text-[10px] font-medium transition-colors",
        active
          ? "bg-[var(--accent-primary-subtle)] text-[var(--accent-primary-text)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)]"
      )}
    >
      <Icon size={18} aria-hidden="true" />
      <span className="max-w-full truncate text-center leading-tight">{label}</span>
      {count ? (
        <span className="absolute right-0.5 top-0.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-1 font-mono text-[8px] text-[var(--text-muted)]">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function TextNavItem({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-[var(--accent-primary-subtle)] text-[var(--accent-primary-text)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)]"
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}
