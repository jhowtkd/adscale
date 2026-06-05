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
        "flex size-9 items-center justify-center rounded-full sm:size-10",
        "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
        "hover:bg-[var(--surface-raised)] transition-all duration-200",
        className
      )}
    >
      <MessageSquarePlus size={16} aria-hidden="true" />
    </button>
  );
}
