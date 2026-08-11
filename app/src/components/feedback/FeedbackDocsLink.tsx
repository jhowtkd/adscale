"use client";

import { ArrowUpRight } from "lucide-react";
import { useFeedback } from "./FeedbackProvider";

export default function FeedbackDocsLink({
  title,
  description,
  ariaLabel,
}: {
  title: string;
  description: string;
  ariaLabel: string;
}) {
  const { openFeedback } = useFeedback();

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => openFeedback()}
      className="flex w-full items-center justify-between gap-4 px-1 py-4 text-left transition-colors hover:text-[var(--active-navigation-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-[var(--text-primary)]">{title}</span>
        <span className="text-sm text-[var(--text-muted)]">{description}</span>
      </span>
      <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-[var(--utility-icon)]" />
    </button>
  );
}
