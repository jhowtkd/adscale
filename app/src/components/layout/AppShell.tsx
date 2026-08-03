"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import Footer from "./Footer";
import V6ShellLayout from "./V6ShellLayout";
import MobileMoreSheet from "./MobileMoreSheet";
import { BookOpen, FolderOpen, Home, MoreHorizontal, Tag } from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const tNav = useTranslations("navigation");
  const tLibrary = useTranslations("library");
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Phase 6 / item 45: Home · Trabalhos · Biblioteca · Marcas · Mais (Config in More)
  const moreActive =
    pathname.startsWith("/templates") ||
    pathname.startsWith("/assistant") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/feedback");

  return (
    <V6ShellLayout>
      <main id="main" className="v6-shell-main shell-offset-bottom-mobile min-h-screen">
        <div className="relative min-w-0 overflow-x-clip shell-min-height-below-topbar">{children}</div>
        <Footer />
      </main>

      <nav
        className="layer-shell-floating fixed bottom-0 left-0 right-0 z-[calc(var(--layer-shell-floating)+2)] grid grid-cols-5 border-t border-[var(--border-dim)] bg-[var(--surface-base)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
        aria-label="Primary mobile navigation"
      >
        <MobileNavItem
          href="/"
          label={tNav("home")}
          icon={Home}
          active={pathname === "/" || pathname === "/dashboard" || pathname.startsWith("/dashboard/")}
        />
        <MobileNavItem
          href="/campaigns"
          label={tNav("works")}
          icon={FolderOpen}
          active={pathname.startsWith("/campaigns")}
        />
        <MobileNavItem
          href="/library"
          label={tLibrary("title")}
          icon={BookOpen}
          active={pathname.startsWith("/library")}
        />
        <MobileNavItem
          href="/brand-kit"
          label={tNav("brands")}
          icon={Tag}
          active={pathname.startsWith("/brand-kit")}
        />
        <MobileNavButton
          label={tNav("more")}
          icon={MoreHorizontal}
          active={moreActive}
          onClick={() => setMoreOpen(true)}
        />
      </nav>

      <MobileMoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </V6ShellLayout>
  );
}

function MobileNavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-2 text-[10px] font-medium leading-tight",
        active
          ? "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]"
          : "text-[var(--text-secondary)]"
      )}
    >
      <Icon
        size={18}
        aria-hidden="true"
        className={active ? "text-[var(--active-navigation-text)]" : "text-[var(--utility-icon)]"}
      />
      <span className="max-w-full text-center whitespace-normal">{label}</span>
    </Link>
  );
}

function MobileNavButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: typeof MoreHorizontal;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-2 text-[10px] font-medium leading-tight",
        active
          ? "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]"
          : "text-[var(--text-secondary)]"
      )}
    >
      <Icon
        size={18}
        aria-hidden="true"
        className={active ? "text-[var(--active-navigation-text)]" : "text-[var(--utility-icon)]"}
      />
      <span className="max-w-full text-center whitespace-normal">{label}</span>
    </button>
  );
}
