"use client";

interface BriefingRestoreBannerProps {
  tBriefing: (key: string) => string;
  onRestore: () => void;
  onDiscard: () => void;
}

export default function BriefingRestoreBanner({ tBriefing, onRestore, onDiscard }: BriefingRestoreBannerProps) {
  return (
    <div className="mx-auto mb-4 max-w-[720px] animate-fade-in rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--warning-text)]">
            {tBriefing("draftFoundTitle")}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {tBriefing("draftFoundDesc")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="min-h-9 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            {tBriefing("discard")}
          </button>
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex min-h-9 items-center rounded-md bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-medium text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-primary-hover)]"
          >
            {tBriefing("restore")}
          </button>
        </div>
      </div>
    </div>
  );
}
