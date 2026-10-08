"use client";

// The v4 navigation rail (desktop): the mark, the active brand, the six destinations, help and the account.
// Icons only: every control has an accessible name and a tooltip title. The active destination gets a filled circle.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleHelp, LayoutGrid, Library, Lightbulb, MessageCircle, Search, SquareCheckBig, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import AccountMenu from "./AccountMenu";
import BrandSwitcher from "./BrandSwitcher";
import { ACCOUNT_AWARE_HREFS, RAIL_DESTINATIONS, railDestinationFor, type RailDestinationId } from "./rail-nav";
import { useRailSearch } from "./rail-search";

const ICONS: Record<RailDestinationId, LucideIcon> = {
  conversation: MessageCircle,
  creations: LayoutGrid,
  library: Library,
  ideas: Lightbulb,
  goals: SquareCheckBig,
};

const circle =
  "grid size-11 shrink-0 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
const idle = "text-[var(--utility-icon)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]";
const current = "bg-[var(--surface-raised)] text-[var(--text-primary)]";

/** The ADScale mark: the solid pixel "A" of the wordmark, drawn on an 8×8 grid so it stays crisp at 16px. */
export function RailMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 8 8" aria-hidden="true" className={className} fill="currentColor" shapeRendering="crispEdges">
      <rect x="3" y="0" width="2" height="1" />
      <rect x="2" y="1" width="4" height="1" />
      <rect x="1" y="2" width="2" height="2" />
      <rect x="5" y="2" width="2" height="2" />
      <rect x="1" y="4" width="6" height="1" />
      <rect x="1" y="5" width="2" height="3" />
      <rect x="5" y="5" width="2" height="3" />
    </svg>
  );
}

export default function Rail() {
  const t = useTranslations("navigation.rail");
  const tLibrary = useTranslations("library");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = useRailSearch();
  const active = railDestinationFor(pathname);
  const chosenAccount = searchParams.get("account");
  const hrefOf = (href: string) => (chosenAccount && ACCOUNT_AWARE_HREFS.has(href) ? `${href}?account=${chosenAccount}` : href);
  const labels: Record<RailDestinationId, string> = {
    conversation: t("conversation"),
    creations: t("creations"),
    library: tLibrary("title"),
    ideas: t("ideas"),
    goals: t("goals"),
  };

  return (
    <aside className="rail-shell-rail" aria-label={t("label")} data-testid="rail">
      <Link
        href="/"
        aria-label="ADScale"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <RailMark className="size-4" />
      </Link>

      <BrandSwitcher className="mt-[33px]" />

      <nav aria-label={t("destinations")} className="mt-[26px]">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {RAIL_DESTINATIONS.slice(0, 1).map((item) => {
            const Icon = ICONS[item.id];
            return (
              <li key={item.id}>
                <Link
                  href={hrefOf(item.href)}
                  aria-label={labels[item.id]}
                  title={labels[item.id]}
                  aria-current={active === item.id ? "page" : undefined}
                  data-testid={`rail-${item.id}`}
                  className={cn(circle, active === item.id ? current : idle)}
                >
                  <Icon size={18} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => search?.request()}
              aria-label={t("search")}
              title={t("search")}
              data-testid="rail-search"
              className={cn(circle, idle)}
            >
              <Search size={18} aria-hidden="true" />
            </button>
          </li>
          {RAIL_DESTINATIONS.slice(1).map((item) => {
            const Icon = ICONS[item.id];
            return (
              <li key={item.id}>
                <Link
                  href={hrefOf(item.href)}
                  aria-label={labels[item.id]}
                  title={labels[item.id]}
                  aria-current={active === item.id ? "page" : undefined}
                  data-testid={`rail-${item.id}`}
                  className={cn(circle, active === item.id ? current : idle)}
                >
                  <Icon size={18} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2">
        <Link
          href="/docs"
          aria-label={t("help")}
          title={t("help")}
          data-testid="rail-help"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--border-default)] text-[var(--utility-icon)] outline-none transition-colors hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <CircleHelp size={17} aria-hidden="true" />
        </Link>
        <AccountMenu />
      </div>
    </aside>
  );
}
