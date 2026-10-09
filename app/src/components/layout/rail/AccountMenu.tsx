"use client";

// The rail has no room for the served ads, settings, docs or sign-out: they live behind the avatar, with the internal
// consoles (staff only) and the feedback console (platform owner only), so no destination is lost when the old sidebar goes.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useAppStore } from "@/lib/store";
import { useEquipeStaffAccess } from "@/lib/hooks/use-equipe-staff";
import { usePlatformOwnerAccess } from "@/lib/hooks/use-platform-owner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function initialsOf(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

export default function AccountMenu({ className, side = "right" }: { className?: string; side?: "right" | "top" }) {
  const t = useTranslations("navigation");
  const tRail = useTranslations("navigation.rail");
  const tServedAds = useTranslations("servedAds");
  const router = useRouter();
  const user = useAppStore((state) => state.user);
  const { data: session } = authClient.useSession();
  const { data: staffAccess } = useEquipeStaffAccess();
  const { data: ownerAccess } = usePlatformOwnerAccess();

  const displayName = session?.user?.name?.trim() || `${user.firstName} ${user.lastName}`.trim() || user.email;
  const email = session?.user?.email || user.email;
  const staffLinks =
    staffAccess?.allowed === true
      ? [
          { href: "/admin/equipe/exceptions", label: t("equipeExceptions") },
          { href: "/admin/equipe/accounts", label: t("equipeAccounts") },
          { href: "/admin/equipe/quality", label: t("equipeQuality") },
        ]
      : [];

  const signOut = () => {
    void authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/login") } });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={tRail("accountMenu", { name: displayName })}
        data-testid="rail-account"
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full bg-[var(--surface-raised)] text-[11px] font-semibold text-[var(--text-secondary)] outline-none transition-colors",
          "hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] aria-expanded:text-[var(--text-primary)]",
          className,
        )}
      >
        <span aria-hidden="true">{initialsOf(displayName)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align="end"
        sideOffset={12}
        className="w-60 border-[var(--border-subtle)] bg-[var(--surface-overlay)]"
      >
        <div className="px-2 py-1.5" data-testid="rail-account-identity">
          <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{displayName}</p>
          {email && email !== displayName ? <p className="truncate text-xs text-[var(--text-muted)]">{email}</p> : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/served-ads" />}>{tServedAds("title")}</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />}>{t("config")}</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/docs" />}>{t("docs")}</DropdownMenuItem>
        {ownerAccess?.allowed === true ? (
          <DropdownMenuItem render={<Link href="/feedback" />}>{t("feedback")}</DropdownMenuItem>
        ) : null}
        {staffLinks.length > 0 ? <DropdownMenuSeparator /> : null}
        {staffLinks.map((link) => (
          <DropdownMenuItem key={link.href} render={<Link href={link.href} />}>
            {link.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut aria-hidden="true" />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
