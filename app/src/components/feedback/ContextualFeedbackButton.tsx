"use client";

import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { studioQuietActionClass } from "@/components/dashboard/studio-stage/StudioInstrument";
import type { FeedbackContextPayload } from "@/lib/feedback/types";
import { useFeedback } from "./FeedbackProvider";

export default function ContextualFeedbackButton({
  label,
  quiet = false,
  ...context
}: FeedbackContextPayload & { label?: string; quiet?: boolean }) {
  const t = useTranslations("feedback");
  const { openFeedback } = useFeedback();
  const text = label ?? t("reportThis");

  if (quiet) {
    return (
      <button
        type="button"
        aria-label={text}
        title={text}
        onClick={() => openFeedback(context)}
        className={`${studioQuietActionClass} size-9 justify-center px-0`}
      >
        <Flag size={16} aria-hidden="true" />
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => openFeedback(context)}
      className="gap-1.5"
    >
      <Flag size={14} aria-hidden="true" />
      {text}
    </Button>
  );
}
