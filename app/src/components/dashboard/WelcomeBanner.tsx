"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

export function WelcomeBanner() {
  const t = useTranslations("common");
  const tc = useTranslations("campaign");

  return (
    <section
      className="relative overflow-hidden rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] px-5 py-5 sm:px-6 animate-fade-in"
    >
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold leading-tight text-[var(--text-primary)] sm:text-[28px]">
            {t("welcomeBack")}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {t("dashboardSubtitle")}
          </p>
        </div>
        <div
          className="animate-fade-in"
          style={{ animationDelay: "150ms" }}
        >
          <Link
            href="/campaigns"
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-white sm:px-5",
              "bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-light)] hover:-translate-y-px",
              "active:scale-[0.98] transition-all duration-200",
              "hover:shadow-[0_4px_16px_rgba(47,182,125,0.2)]"
            )}
          >
            <Plus size={16} />
            {tc("new")}
          </Link>
        </div>
      </div>
    </section>
  );
}
