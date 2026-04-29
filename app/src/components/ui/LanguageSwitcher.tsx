"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { locales, type Locale } from "@/i18n/config";

export default function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("language");
  const [isPending, startTransition] = useTransition();

  const handleChange = async (newLocale: Locale) => {
    if (newLocale === locale) return;

    // Set cookie immediately
    document.cookie = `locale=${newLocale};path=/;max-age=${60 * 60 * 24 * 365}`;

    // Persist to user profile if logged in
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
    <div className={cn("relative inline-flex items-center", className)}>
      <Globe size={14} className="text-[var(--text-muted)] mr-1.5" />
      <select
        value={locale}
        onChange={(e) => handleChange(e.target.value as Locale)}
        disabled={isPending}
        className={cn(
          "h-7 pl-1.5 pr-6 text-xs rounded-md bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] focus:border-[var(--accent-mint)] focus:outline-none appearance-none cursor-pointer",
          isPending && "opacity-50 cursor-wait"
        )}
        aria-label={t("label")}
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {t(loc)}
          </option>
        ))}
      </select>
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] text-[10px]">
        ▼
      </span>
    </div>
  );
}
