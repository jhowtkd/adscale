"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const PANEL_RETURN_KEY = "adscale:panel-return";

export default function SidebarAssistantModeSwitch() {
  const tAssistant = useTranslations("assistant.mode");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isChatMode = pathname.startsWith("/assistant");

  const switchToChat = () => {
    if (!isChatMode) {
      const query = searchParams.toString();
      const returnPath = query ? `${pathname}?${query}` : pathname;
      sessionStorage.setItem(PANEL_RETURN_KEY, returnPath);
    }
    const threadId = searchParams.get("threadId");
    const query = threadId ? `?threadId=${encodeURIComponent(threadId)}` : "";
    router.push(`/assistant${query}`);
  };

  const switchToPanel = () => {
    const stored = sessionStorage.getItem(PANEL_RETURN_KEY);
    router.push(stored ?? "/");
  };

  return (
    <div
      role="group"
      aria-label={tAssistant("headerTitle")}
      className="flex w-full flex-col gap-1 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] p-1"
    >
      <button
        type="button"
        aria-pressed={!isChatMode}
        onClick={switchToPanel}
        className={cn(
          "w-full rounded-[calc(var(--radius-control)-2px)] px-3 py-2.5 text-left text-[13px] font-medium transition-colors",
          !isChatMode
            ? "bg-[var(--selection-bg)] font-semibold text-[var(--selection-text)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
        )}
      >
        {tAssistant("panel")}
      </button>
      <button
        type="button"
        aria-pressed={isChatMode}
        onClick={switchToChat}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-2.5 text-left text-[13px] font-medium transition-colors",
          isChatMode
            ? "bg-[var(--selection-bg)] font-semibold text-[var(--selection-text)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
        )}
      >
        <span>{tAssistant("chat")}</span>
        <span
          aria-hidden="true"
          className="rounded bg-[var(--info-bg)] px-1.5 py-0.5 font-mono text-xs font-semibold leading-none text-[var(--info-text)]"
        >
          NOVO
        </span>
      </button>
    </div>
  );
}
