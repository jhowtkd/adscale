"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type AssistantMobileTab = "tree" | "chat" | "context";

export default function AssistantMobileTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: AssistantMobileTab;
  onTabChange: (tab: AssistantMobileTab) => void;
}) {
  const t = useTranslations("assistant.tabs");

  const tabs: { id: AssistantMobileTab; label: string }[] = [
    { id: "tree", label: t("tree") },
    { id: "chat", label: t("chat") },
    { id: "context", label: t("context") },
  ];

  return (
    <nav
      aria-label={t("chat")}
      className="layer-shell-floating fixed bottom-0 left-0 right-0 grid grid-cols-3 border-t border-[var(--border-dim)] bg-[var(--surface-base)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-2 text-[11px] font-medium sm:text-xs",
              active
                ? "bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]"
                : "text-[var(--text-secondary)]"
            )}
          >
            <span className="max-w-full truncate">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
