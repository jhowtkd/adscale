import { cn } from "@/lib/utils";
import {
  settingsButtonClass,
  settingsFieldClass,
} from "@/components/settings/settings-chrome";

export const ownerButtonClass = settingsButtonClass;
export const ownerFieldClass = settingsFieldClass;

export const ownerShellClass =
  "mt-8 grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-12";

export const ownerNavClass = "flex flex-col gap-0.5 lg:sticky lg:top-4";

export function ownerNavItemClass(active: boolean) {
  return cn(
    "flex min-h-9 items-center rounded-md px-3 text-left text-sm",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
    active
      ? "bg-white/8 font-medium text-[var(--text-primary)]"
      : "text-[var(--text-muted)] hover:bg-white/6 hover:text-[var(--text-primary)]",
  );
}

export function ownerListItemClass(active: boolean) {
  return cn(
    "w-full rounded-md px-3 py-3 text-left",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
    active
      ? "bg-white/8 text-[var(--text-primary)]"
      : "text-[var(--text-secondary)] hover:bg-white/6 hover:text-[var(--text-primary)]",
  );
}
