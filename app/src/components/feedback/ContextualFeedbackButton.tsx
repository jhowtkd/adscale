"use client";

import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { FeedbackContextPayload } from "@/lib/feedback/types";
import { useFeedback } from "./FeedbackProvider";

export default function ContextualFeedbackButton({
  label,
  ...context
}: FeedbackContextPayload & { label?: string }) {
  const t = useTranslations("feedback");
  const { openFeedback } = useFeedback();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => openFeedback(context)}
      className="gap-1.5"
    >
      <Flag size={14} aria-hidden="true" />
      {label ?? t("reportThis")}
    </Button>
  );
}
