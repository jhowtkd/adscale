"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { locales, type Locale } from "@/i18n/config";

const localeFlags: Record<Locale, string> = {
  "pt-BR": "🇧🇷",
  en: "🇺🇸",
};

export default function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("language");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const handleChange = async (newLocale: Locale) => {
    if (newLocale === locale) return;
    setOpen(false);

    try {
      await fetch("/api/user/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLocale }),
      });
    } catch {
      // Silent fail — cookie is the source of truth
    }

    startTransition(() => {
      window.location.reload();
    });
  };

  return (
    <div ref={rootRef} className={cn("relative inline-flex items-center", className)}>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-9 items-center gap-1 rounded-full border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 text-sm",
          "hover:border-[var(--border-medium)] focus:border-[var(--accent-mint)] focus:outline-none focus:ring-2 focus:ring-[rgba(47,182,125,0.15)]",
          isPending && "opacity-50 cursor-wait"
        )}
        aria-label={t("label")}
        aria-expanded={open}
      >
        <span className="text-base leading-none" aria-hidden="true">
          {localeFlags[locale as Locale] ?? localeFlags.en}
        </span>
        <ChevronDown size={13} className="text-[var(--text-muted)]" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] shadow-[0_16px_48px_rgba(0,0,0,0.1)]">
          {locales.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => handleChange(loc)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--accent-mint-dim)]",
                loc === locale && "font-medium text-[var(--accent-mint)]"
              )}
            >
              <span className="text-base leading-none" aria-hidden="true">
                {localeFlags[loc]}
              </span>
              <span className="min-w-0 flex-1 truncate">{t(loc)}</span>
              {loc === locale && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
