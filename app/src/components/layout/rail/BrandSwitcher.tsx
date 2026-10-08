"use client";

// The brand of the rail (spec 2026-10-07 §3, frames c8 and c8b): the active brand's monogram under the mark, a menu that
// switches brands, and "Adicionar marca", locked on the free plan, where the plan card is the way on.

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, ChevronDown, Lock, Plus } from "lucide-react";
import AssistantCreateClientDialog from "@/components/assistant/AssistantCreateClientDialog";
import { FreePlanCta } from "@/components/billing/FreePlanCta";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useActiveBrand, useSwitchActiveBrand } from "@/lib/brands/active-brand-context";
import { useFreePlanAccount } from "@/lib/equipe/use-equipe";
import { useClientProfiles } from "@/lib/hooks/use-client-profiles";
import { cn } from "@/lib/utils";

/** Two letters of the brand: the initials of its first two words, or its first two letters. */
export function brandMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "?";
}

const createdTime = (profile: { createdAt?: Date | string }) => (profile.createdAt ? new Date(profile.createdAt).getTime() : 0);

export default function BrandSwitcher({ className, menuSide = "right" }: {
  className?: string;
  /** Where the menu opens: beside the rail (frame c8), or under the control on the phone's top bar, where there is no rail. */
  menuSide?: "right" | "bottom";
}) {
  const t = useTranslations("navigation.rail");
  const tCommon = useTranslations("common");
  const brand = useActiveBrand();
  const switchBrand = useSwitchActiveBrand();
  const { data: profiles = [] } = useClientProfiles();
  const freePlan = useFreePlanAccount();
  // Both dialogs open by state, after the menu is gone: they say where focus goes back to (the control that opened the menu).
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  if (!brand) return null;

  // Oldest first, as in c8 and as the server picks a brand when none is chosen; the list comes newest-edited first, which
  // would move the brands around after every edit. The active brand is always a row, even while the list is still loading.
  const byAge = [...profiles].sort((a, b) => createdTime(a) - createdTime(b) || a.id.localeCompare(b.id));
  const rows = byAge.some((profile) => profile.id === brand.id) ? byAge : [{ id: brand.id, name: brand.name }, ...byAge];

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          ref={triggerRef}
          type="button"
          aria-label={t("brandSwitcher", { name: brand.name })}
          title={brand.name}
          data-testid="rail-brand-switcher"
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-[14px] border border-[var(--warning-border)] bg-[var(--warning-bg)] text-[11px] font-semibold text-[var(--warning-text)] outline-none transition-colors hover:border-[var(--warning-text)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
            className,
          )}
        >
          <span className="flex flex-col items-center leading-none">
            {brandMonogram(brand.name)}
            <ChevronDown size={10} aria-hidden="true" className="mt-0.5" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side={menuSide}
          sideOffset={menuSide === "right" ? 24 : 8}
          className="w-[19rem] max-w-[calc(100vw-2rem)] rounded-3xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-3"
        >
          <p className="px-1 pb-2 pt-0.5 text-sm font-semibold text-[var(--text-primary)]">{t("switchBrand")}</p>
          {rows.map((profile) => {
            const isActive = profile.id === brand.id;
            return (
              <DropdownMenuItem
                key={profile.id}
                data-testid="rail-brand-option"
                onClick={() => { if (!isActive) switchBrand(profile.id); }}
                className={cn("gap-3 rounded-2xl px-2 py-2", isActive && "bg-white/6")}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-[10px] text-[10px] font-semibold",
                    isActive ? "bg-[var(--warning-bg)] text-[var(--warning-text)]" : "bg-[var(--surface-inset)] text-[var(--text-secondary)]",
                  )}
                >
                  {brandMonogram(profile.name)}
                </span>
                <span className="min-w-0 flex-1 truncate">{profile.name}</span>
                {isActive ? <Check size={14} aria-label={t("activeBrand")} className="text-[var(--warning-text)]" /> : null}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator className="mx-0 my-2" />
          {freePlan === null ? (
            <DropdownMenuItem data-testid="rail-add-brand" onClick={() => setCreating(true)} className="gap-3 rounded-2xl px-2 py-2">
              <Plus size={14} aria-hidden="true" className="mx-2.5" />
              {t("addBrand")}
            </DropdownMenuItem>
          ) : freePlan ? (
            <div data-testid="rail-add-brand-locked" className="flex flex-col gap-1.5 rounded-2xl bg-[var(--surface-inset)] px-3 py-3 text-sm">
              <span className="flex items-center gap-2 font-semibold text-[var(--text-primary)]"><Lock size={14} aria-hidden="true" />{t("addBrand")}</span>
              <span className="text-xs text-[var(--text-secondary)]">{t("addBrandLocked")}</span>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setPlanOpen(true); }}
                className="mt-1 flex items-center gap-2 self-start rounded-md text-xs font-medium text-[var(--text-primary)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                {t("seePlanCard")}
                <ArrowRight size={12} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AssistantCreateClientDialog
        open={creating}
        onOpenChange={setCreating}
        onSuccess={(id) => switchBrand(id)}
        labels={{
          title: t("addBrandDialog.title"),
          description: t("addBrandDialog.description"),
          nameLabel: t("addBrandDialog.nameLabel"),
          namePlaceholder: t("addBrandDialog.namePlaceholder"),
          submit: t("addBrandDialog.submit"),
        }}
        closeLabel={tCommon("close")}
        finalFocus={triggerRef}
      />
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent size="sm" closeLabel={tCommon("close")} finalFocus={triggerRef}>
          <DialogHeader><DialogTitle>{t("addBrand")}</DialogTitle></DialogHeader>
          <DialogBody>
            {freePlan ? <FreePlanCta accountId={freePlan.accountId} intro={t("addBrandLocked")} variant="stage" /> : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
