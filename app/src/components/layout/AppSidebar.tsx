"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  FolderOpen,
  House,
  LogOut,
  Settings,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useBillingStatus } from "@/lib/hooks/use-billing";
import { useCanonicalWorks } from "@/lib/hooks/use-canonical-works";
import { usePlatformOwnerAccess } from "@/lib/hooks/use-platform-owner";
import { authClient } from "@/lib/auth-client";
import AccountStatusBadge from "@/components/layout/AccountStatusBadge";
import SidebarBrandKitFeature from "@/components/layout/SidebarBrandKitFeature";
import AppSidebarCampaignMap from "@/components/layout/AppSidebarCampaignMap";
import SidebarRecentWorks from "@/components/layout/SidebarRecentWorks";
import { NotificationMenu } from "@/components/layout/TopBar";
import { cn } from "@/lib/utils";

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations("navigation");
  const tLibrary = useTranslations("library");
  const user = useAppStore((s) => s.user);
  const billing = useAppStore((s) => s.billing);
  const { data: session } = authClient.useSession();
  const { data: works = [] } = useCanonicalWorks();
  const { data: billingStatus } = useBillingStatus();
  const { data: ownerAccess } = usePlatformOwnerAccess();

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
  const isPlatformOwner = ownerAccess?.allowed === true;

  // The shell has four primary destinations. Overview stays available from the account card.
  const isWorks = pathname.startsWith("/campaigns");
  const isHome = pathname === "/" || pathname === "/quick-tools/create-post" || pathname.startsWith("/creative-work/");
  const isLibrary = pathname.startsWith("/library");
  const isBrand = pathname.startsWith("/brand-kit");
  const isConfig = pathname.startsWith("/settings");
  const isDocs = pathname.startsWith("/docs");

  const worksCount = works.length > 0 ? String(works.length) : undefined;

  const handleLogout = () => {
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => router.push("/login"),
      },
    });
  };

  return (
    <aside className="v6-shell-sidebar" aria-label="Navegação principal">
      <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="mb-2.5 shrink-0 border-b border-[var(--border-subtle)] px-2 pb-4 pt-2">
        <Link href="/" className="flex w-full justify-center rounded-md py-0.5" aria-label="ADScale">
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

      <nav
        className="mb-3 grid shrink-0 grid-cols-4 gap-1"
        aria-label={tNav("sectionPrincipal")}
      >
        <IconNavItem
          href="/"
          active={isHome}
          label={tNav("home")}
          icon={House}
        />
        <IconNavItem
          href="/campaigns"
          active={isWorks}
          label={tNav("works")}
          icon={FolderOpen}
          count={worksCount}
        />
        <IconNavItem
          href="/library"
          active={isLibrary}
          label={tLibrary("title")}
          icon={BookOpen}
        />
        <IconNavItem
          href="/brand-kit"
          active={isBrand}
          label={tNav("brands")}
          icon={Tag}
        />
      </nav>

      <SidebarBrandKitFeature />

      <div
        data-testid="sidebar-campaign-region"
        className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden border-t border-[var(--border-subtle)] pt-3"
      >
        <SidebarRecentWorks />
        <AppSidebarCampaignMap />
      </div>

      <div className="mt-auto shrink-0 border-t border-[var(--border-subtle)] pt-3">
        <div className="mb-2 flex justify-end px-1"><NotificationMenu /></div>
        <TextNavItem
          href="/docs"
          active={isDocs}
          label={tNav("docs")}
          icon={BookOpen}
        />
        <TextNavItem
          href="/settings"
          active={isConfig}
          label={tNav("config")}
          icon={Settings}
        />
        {isPlatformOwner ? <TextNavItem href="/feedback" active={pathname.startsWith("/feedback")} label={tNav("feedback")} /> : null}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-2 transition-colors hover:bg-[var(--surface-base)]"
        >
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--selection-bg)] text-xs font-bold text-[var(--selection-text)]">
            {initials}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{displayName}</p>
              {isTesterAccount ? <AccountStatusBadge variant="tester" /> : null}
            </div>
            {!isTesterAccount ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {billingStatus?.creditBalance ?? planLabel} {tNav("credits")}
              </p>
            ) : null}
          </div>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-base)] hover:text-[var(--danger-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <LogOut size={16} aria-hidden="true" className="shrink-0" />
          <span>{tNav("logout")}</span>
        </button>
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
      aria-current={active ? "page" : undefined}
      title={count ? `${label} (${count})` : label}
      className={cn(
        "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-1 py-2 text-[10px] font-medium transition-colors",
        active
          ? "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)]"
      )}
    >
      <Icon
        size={18}
        aria-hidden="true"
        className={active ? "text-[var(--active-navigation-text)]" : "text-[var(--utility-icon)]"}
      />
      <span className="max-w-full truncate text-center text-[11px] font-medium tracking-[0.02em] leading-tight">{label}</span>
      {count ? (
        <span className="absolute right-0.5 top-0.5 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-base)] px-1 font-mono text-[8px] tabular-nums text-[var(--text-muted)]">
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
  icon: Icon,
}: {
  href: string;
  label: string;
  active?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)]"
      )}
    >
      {Icon ? (
        <Icon
          size={16}
          aria-hidden="true"
          className={active ? "text-[var(--active-navigation-text)]" : "text-[var(--utility-icon)]"}
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}
