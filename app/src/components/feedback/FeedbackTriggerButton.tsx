"use client";

import { MessageSquarePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useFeedback } from "./FeedbackProvider";

export default function FeedbackTriggerButton({ className }: { className?: string }) {
  const t = useTranslations("feedback");
  const { openFeedback } = useFeedback();

  return (
    <button
      type="button"
      onClick={() => openFeedback()}
      aria-label={t("trigger")}
      className={cn(
        "flex shrink-0 items-center justify-center gap-1.5 rounded-full border transition-all duration-200",
        "size-9 sm:h-10 sm:w-auto sm:rounded-lg sm:px-3",
        "border-[var(--accent-green)]/35 bg-[var(--accent-green)]/10 text-[var(--accent-green-text)]",
        "hover:border-[var(--accent-green)]/55 hover:bg-[var(--accent-green)]/20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/40",
        className
      )}
    >
      <MessageSquarePlus size={16} className="shrink-0" aria-hidden="true" />
      <span className="hidden text-xs font-semibold sm:inline">{t("triggerShort")}</span>
    </button>
  );
}
