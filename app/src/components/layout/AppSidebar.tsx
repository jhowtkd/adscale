"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/lib/store";
import { useCampaigns } from "@/lib/hooks/use-campaigns";
import { useBillingStatus } from "@/lib/hooks/use-billing";
import { authClient } from "@/lib/auth-client";
import AccountStatusBadge from "@/components/layout/AccountStatusBadge";

type AppSidebarVariant = "production" | "preview";

export default function AppSidebar({ variant = "production" }: { variant?: AppSidebarVariant }) {
  const pathname = usePathname();
  const tNav = useTranslations("navigation");
  const tLibrary = useTranslations("library");
  const user = useAppStore((s) => s.user);
  const billing = useAppStore((s) => s.billing);
  const { data: session } = authClient.useSession();
  const { totalCount } = useCampaigns();
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

  return (
    <aside className="v6-shell-sidebar" aria-label="Navegação principal">
      <div className="mb-2.5 border-b border-[var(--border-subtle)] px-2 pb-4 pt-2">
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

      <div className="mb-2 flex items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--surface-base)] px-2.5 py-2">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 text-[var(--text-muted)] opacity-50"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-muted)]">Buscar…</span>
        <kbd className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
          ⌘K
        </kbd>
      </div>

      <nav className="flex flex-col gap-0.5">
        <NavItem
          href={isPreview ? "/v6/dashboard" : "/"}
          active={isDashboard}
          label={tNav("dashboard")}
        />
        <NavItem
          href={isPreview ? "/v6/campaigns" : "/campaigns"}
          active={isCampaigns}
          label={tNav("campaigns")}
          count={campaignCount}
        />
        <NavItem
          href={isPreview ? "/v6/library" : "/library"}
          active={isLibrary}
          label={tLibrary("title")}
        />
        {!isPreview ? (
          <NavItem href="/templates" active={pathname.startsWith("/templates")} label={tNav("templates")} />
        ) : (
          <NavItem href="#" label="Briefings" />
        )}
      </nav>

      <div className="mt-3 flex flex-col gap-0.5 border-t border-[var(--border-subtle)] pt-3">
        <p className="px-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Laboratório
        </p>
        <NavItem
          href={isPreview ? "#" : "/assistant"}
          active={!isPreview && pathname.startsWith("/assistant")}
          label="Curador IA"
          badge="BETA"
        />
        <NavItem
          href={isPreview ? "#" : "/restyling"}
          active={!isPreview && pathname.startsWith("/restyling")}
          label={tNav("restyling")}
        />
        <NavItem
          href={isPreview ? "#" : "/templates"}
          active={!isPreview && pathname.startsWith("/templates")}
          label="Receita de estratégia"
        />
      </div>

      <div className="mt-auto border-t border-[var(--border-subtle)] pt-3">
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
      </div>
    </aside>
  );
}

function NavItem({
  href,
  label,
  active,
  count,
  badge,
}: {
  href: string;
  label: string;
  active?: boolean;
  count?: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-[13px] font-medium transition-colors ${
        active
          ? "bg-[var(--accent-primary-subtle)] text-[var(--accent-primary-text)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count ? (
        <span className="ml-auto rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
          {count}
        </span>
      ) : null}
      {badge ? (
        <span className="ml-auto rounded-full border border-[color-mix(in_oklch,var(--warning-text)_40%,transparent)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--warning-text)]">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
