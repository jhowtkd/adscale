# App shell, sidebar, header, nav

Studio/home (`/`) lives under the `(dashboard)` route group. Layout chain:

```
app/src/app/layout.tsx                          # root: fonts, ThemeProvider (forced dark), intl, query, tooltip
  └── app/src/app/(dashboard)/layout.tsx        # DashboardShellSwitcher
        ├── default: AppShell → V6ShellLayout + mobile bottom nav
        └── /assistant: V6ShellLayout + assistant-shell-host (no AppShell footer/bottom nav)
```

**Active studio chrome (v6 floating shell):**

- Sidebar: `AppSidebar` (`aside.v6-shell-sidebar`) — desktop only (`display: none` under 768px)
- Header: slim mobile/desktop bar inside `AppShell` (logo wordmark + `NotificationMenu`), not the default `TopBar` export
- Main: `main.v6-shell-main` with CSS offsets for the floating sidebar/topbar
- Mobile nav: 5-tab bottom bar (Home, Trabalhos, Biblioteca, Marca, Mais) + `MobileMoreSheet`

`app/src/components/layout/TopBar.tsx` still exists (legacy floating/inline header + account dropdown + full notification panel). The v6 studio path imports **only** `NotificationMenu` from it.

---

## Dashboard layout (route group)

### `app/src/app/(dashboard)/layout.tsx`

```tsx
import DashboardShellSwitcher from "@/components/layout/DashboardShellSwitcher";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShellSwitcher>{children}</DashboardShellSwitcher>;
}
```


## DashboardShellSwitcher

### `app/src/components/layout/DashboardShellSwitcher.tsx`

```tsx
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import AppShell from "./AppShell";
import V6ShellLayout from "./V6ShellLayout";
import { NotificationMenu } from "./TopBar";

export default function DashboardShellSwitcher({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const tNav = useTranslations("navigation");
  const isAssistant = pathname.startsWith("/assistant");

  if (isAssistant) {
    return (
      <V6ShellLayout>
        <header className="fixed inset-x-0 top-0 z-[calc(var(--layer-shell-floating)+1)] flex h-12 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 md:hidden">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{tNav("home")}</Link>
            <Link href="/campaigns" className="text-xs text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{tNav("works")}</Link>
          </div>
          <NotificationMenu />
        </header>
        <main id="main" className="v6-shell-main assistant-shell-host flex min-h-0 flex-col overflow-hidden pb-0">
          {children}
        </main>
      </V6ShellLayout>
    );
  }

  return <AppShell>{children}</AppShell>;
}
```


## AppShell (studio/home shell)

### `app/src/components/layout/AppShell.tsx`

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import Footer from "./Footer";
import V6ShellLayout from "./V6ShellLayout";
import MobileMoreSheet from "./MobileMoreSheet";
import { NotificationMenu } from "./TopBar";
import { BookOpen, FolderOpen, Home, MoreHorizontal, Tag } from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const tNav = useTranslations("navigation");
  const tLibrary = useTranslations("library");
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Phase 6 / item 45: Home · Trabalhos · Biblioteca · Marca · Mais (Config in More)
  const moreActive =
    pathname.startsWith("/docs") ||
    pathname.startsWith("/templates") ||
    pathname.startsWith("/assistant") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/feedback");

  return (
    <V6ShellLayout>
      <header className="fixed inset-x-0 top-0 z-[calc(var(--layer-shell-floating)+1)] flex h-12 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 md:left-auto md:right-[var(--shell-v6-gap)] md:top-[calc(var(--shell-v6-gap)+0.75rem)] md:h-9 md:border-0 md:bg-transparent md:px-0">
        <span className="text-sm font-semibold text-[var(--text-primary)] md:hidden">ADScale</span>
        <NotificationMenu />
      </header>
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
          active={pathname === "/" || pathname.startsWith("/quick-tools/")}
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
```


## V6ShellLayout

### `app/src/components/layout/V6ShellLayout.tsx`

```tsx
"use client";

import { Suspense, type ReactNode } from "react";
import AppSidebar from "./AppSidebar";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import { MissionInsightProvider } from "@/components/mission-insights/MissionInsightProvider";
import FeedbackBreadcrumbTracker from "@/components/feedback/FeedbackBreadcrumbTracker";
import { AssistantSurfaceProvider } from "@/components/assistant/AssistantSurfaceContext";

export default function V6ShellLayout({ children }: { children: ReactNode }) {
  return (
    <AssistantSurfaceProvider>
      <FeedbackProvider>
        <MissionInsightProvider>
          <div className="min-h-screen bg-[var(--canvas)]">
            <Suspense fallback={null}>
              <FeedbackBreadcrumbTracker />
            </Suspense>
            <AppSidebar />
            {children}
          </div>
        </MissionInsightProvider>
      </FeedbackProvider>
    </AssistantSurfaceProvider>
  );
}
```


## AppSidebar

### `app/src/components/layout/AppSidebar.tsx`

```tsx
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
import SidebarRecentWorks from "@/components/layout/SidebarRecentWorks";
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
      </div>

      <div className="mt-auto shrink-0 border-t border-[var(--border-subtle)] pt-3">
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
      <span className="flex min-h-6 max-w-full items-center text-center leading-tight">{label}</span>
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
```


## MobileMoreSheet

### `app/src/components/layout/MobileMoreSheet.tsx`

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, LayoutDashboard, LogOut, Settings, type LucideIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface MobileMoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type MobileMoreItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: string;
};

export default function MobileMoreSheet({ open, onOpenChange }: MobileMoreSheetProps) {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations("navigation");

  // Config lives in More (item 45); primary tabs are Home · Trabalhos · Biblioteca · Marcas
  const items: MobileMoreItem[] = [
    {
      href: "/dashboard",
      label: tNav("dashboard"),
      icon: LayoutDashboard,
      active: pathname.startsWith("/dashboard"),
    },
    {
      href: "/settings",
      label: tNav("config"),
      icon: Settings,
      active: pathname.startsWith("/settings"),
    },
    { href: "/docs", label: tNav("docs"), icon: BookOpen, active: pathname.startsWith("/docs") },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>{tNav("more")}</SheetTitle>
        </SheetHeader>
        <SheetBody className="grid gap-1 pt-2">
          {items.map(({ href, label, icon: Icon, active, badge }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={() => onOpenChange(false)}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                active
                  ? "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-base)]"
              )}
            >
              <Icon
                size={18}
                aria-hidden="true"
                className={active ? "text-[var(--active-navigation-text)]" : "text-[var(--utility-icon)]"}
              />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {badge ? (
                <span className="rounded-full border border-[color-mix(in_oklch,var(--warning-text)_40%,transparent)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--warning-text)]">
                  {badge}
                </span>
              ) : null}
            </Link>
          ))}
          <button type="button" onClick={() => void authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })} className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-base)]">
            <LogOut size={18} aria-hidden="true" className="text-[var(--utility-icon)]" />
            {tNav("logout")}
          </button>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
```


## Footer

### `app/src/components/layout/Footer.tsx`

```tsx
"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border-dim)] px-8 py-6 text-center">
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          ADScale &copy; 2026
        </p>
        <div className="flex gap-4 text-xs text-[var(--text-muted)]">
          <Link href="/privacy" className="hover:text-[var(--text-primary)] hover:underline">
            Privacidade
          </Link>
          <Link href="/terms" className="hover:text-[var(--text-primary)] hover:underline">
            Termos
          </Link>
        </div>
      </div>
    </footer>
  );
}
```


## Root layout (fonts + providers)

### `app/src/app/layout.tsx`

```tsx
import type { Metadata, Viewport } from "next";
import { Inter, Press_Start_2P, Space_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import QueryProvider from "@/components/providers/QueryProvider";
import A11yProvider from "@/components/providers/A11yProvider";
import CookieBanner from "@/components/cookie-consent/CookieBanner";
import { SentryErrorBoundary } from "@/components/providers/SentryErrorBoundary";
import ToastStack from "@/components/providers/ToastStack";
import ThemeProvider from "@/components/providers/ThemeProvider";
import MotionProvider from "@/components/providers/MotionProvider";
import ClientRuntimeGuards from "@/components/layout/ClientRuntimeGuards";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const messages = await getMessages();
  const meta = messages.metadata as Record<string, string>;
  return {
    title: meta?.title ?? "ADScale",
    description: meta?.description ?? "",
    other: {
      "dns-prefetch": "//r2.adscale.com",
    },
  };
}

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

const pressStart = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-press-start",
  display: "swap",
  preload: false,
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, messages, tCommon] = await Promise.all([getLocale(), getMessages(), getTranslations("common")]);

  return (
    <html lang={locale} className={`${inter.variable} ${spaceMono.variable} ${pressStart.variable} dark antialiased`} suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://r2.adscale.com" />
        <link rel="dns-prefetch" href="https://r2.adscale.com" />
      </head>
      <body className="min-h-screen bg-background text-foreground font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--surface-base)] focus:text-[var(--text-primary)] focus:rounded-md focus:shadow-lg focus:ring-2 focus:ring-[var(--focus-ring)]"
        >
          {tCommon("skipToContent")}
        </a>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <QueryProvider>
            <A11yProvider>
              <TooltipProvider>
                <SentryErrorBoundary>
                  <MotionProvider>
                    <div className="min-h-screen">
                      {children}
                      <CookieBanner />
                      <Toaster
                        position="bottom-right"
                        toastOptions={{
                          style: {
                            background: "var(--surface-base)",
                            border: "1px solid var(--border-dim)",
                            color: "var(--text-primary)",
                          },
                        }}
                      />
                      <ToastStack />
                      <ClientRuntimeGuards />
                    </div>
                  </MotionProvider>
                </SentryErrorBoundary>
              </TooltipProvider>
            </A11yProvider>
          </QueryProvider>
        </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```


## Public marketing/legal chrome

### `app/src/app/(public)/layout.tsx`

```tsx
import Link from "next/link";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--surface-base)]">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-6">
          <Link href="/" className="text-lg font-bold text-[var(--neutral-text)]">
            ADScale
          </Link>
        </div>
      </header>
      {children}
      <footer className="border-t border-[var(--border-subtle)] bg-[var(--surface-base)] py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-6 text-xs text-[var(--text-secondary)] sm:flex-row sm:justify-between">
          <span>© 2026 ADScale. Todos os direitos reservados.</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-[var(--text-primary)] hover:underline">
              Privacidade
            </Link>
            <Link href="/terms" className="hover:text-[var(--text-primary)] hover:underline">
              Termos
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
```


## Page primitives

### `app/src/components/layout/PageHeader.tsx`

```tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export default function PageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-[var(--border-dim)] py-6 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="product-page-title min-w-0 break-words text-[var(--text-primary)]">{title}</h1>
          {meta ? <div className="shrink-0">{meta}</div> : null}
        </div>
        {description ? (
          <p className="text-sm text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
```


### `app/src/components/layout/PageFrame.tsx`

```tsx
import { cn } from "@/lib/utils";

export type PageFrameWidth =
  | "operational"
  | "workspace"
  | "form"
  | "reading"
  | "wide"
  | "fluid";

const WIDTH_CLASS: Record<PageFrameWidth, string> = {
  operational: "content-operational",
  workspace: "content-workspace",
  form: "content-form",
  reading: "content-reading",
  wide: "content-wide",
  fluid: "content-fluid",
};

export default function PageFrame({
  children,
  width = "operational",
  className,
}: {
  children: React.ReactNode;
  width?: PageFrameWidth;
  className?: string;
}) {
  return (
    <div className={cn("page-gutters w-full min-w-0 overflow-x-clip", WIDTH_CLASS[width], className)}>
      {children}
    </div>
  );
}
```


### `app/src/components/layout/PageSection.tsx`

```tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export default function PageSection({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("space-y-4", className)}>
      {(title || description || actions) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            {title ? (
              <h2 className="product-section-title text-[var(--text-primary)]">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-sm text-[var(--text-secondary)]">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
```


### `app/src/components/layout/Toolbar.tsx`

```tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export default function Toolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      {children}
    </div>
  );
}
```


## Assistant nested layout

### `app/src/app/(dashboard)/assistant/layout.tsx`

```tsx
import AssistantShell from "@/components/assistant/AssistantShell";
import AssistantContextPanelSlot from "@/components/assistant/AssistantContextPanelSlot";
import AssistantSidebarPanel from "@/components/assistant/AssistantSidebarPanel";

export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AssistantShell
      sidebar={<AssistantSidebarPanel />}
      hideDesktopSidebar
      main={children}
      contextPanel={<AssistantContextPanelSlot />}
    />
  );
}
```


## Other layout modules (not dumped)

| Path | Role |
|---|---|
| `app/src/components/layout/TopBar.tsx` | Legacy header; `NotificationMenu` + `deriveRouteTitle` used by v6 |
| `app/src/components/layout/ActiveBrandSwitcher.tsx` | Native `<select>` for active brand (home + brand-kit) |
| `app/src/components/layout/SidebarBrandKitFeature.tsx` | Brand-kit status card in sidebar |
| `app/src/components/layout/SidebarRecentWorks.tsx` | Recent works list in sidebar |
| `app/src/components/layout/SidebarAssistantModeSwitch.tsx` | Assistant mode switch |
| `app/src/components/layout/AccountStatusBadge.tsx` | Demo/tester badge |
| `app/src/components/layout/ClientRuntimeGuards.tsx` | Chunk/version recovery |
| `app/src/components/layout/DeploymentVersionGuard.tsx` | Deploy mismatch guard |
| `app/src/components/layout/ChunkLoadRecovery.tsx` | Chunk load error recovery |
