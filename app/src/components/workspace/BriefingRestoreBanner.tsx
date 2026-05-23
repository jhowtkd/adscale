"use client";

interface BriefingRestoreBannerProps {
  tBriefing: (key: string) => string;
  onRestore: () => void;
  onDiscard: () => void;
}

export default function BriefingRestoreBanner({ tBriefing, onRestore, onDiscard }: BriefingRestoreBannerProps) {
  return (
    <div className="max-w-[720px] mx-auto mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-amber-900">
            {tBriefing("draftFoundTitle")}
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            {tBriefing("draftFoundDesc")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onDiscard}
            className="text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
          >
            {tBriefing("discard")}
          </button>
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
          >
            {tBriefing("restore")}
          </button>
        </div>
      </div>
    </div>
  );
}
