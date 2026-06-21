"use client";

import { usePathname } from "next/navigation";
import { HUMAN_QUALITY_CORPUS_COHORTS } from "@/server/human-quality/corpus";
import { useQualityContext } from "./quality-context";

export default function QualityScopeHeader({
  showCohortFilter = false,
  onScopeChange,
}: {
  showCohortFilter?: boolean;
  onScopeChange?: () => void;
}) {
  const pathname = usePathname();
  const { scope, workspaceId, cohort, setScope, setWorkspaceId, setCohort } = useQualityContext();
  const showCohort = showCohortFilter && !(pathname?.endsWith("/trends") ?? false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[var(--text-primary)]">Corpus scope</span>
        <div
          className="inline-flex rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] p-0.5"
          role="group"
          aria-label="Corpus scope"
        >
          {(["global", "workspace"] as const).map((scopeOption) => (
            <button
              key={scopeOption}
              type="button"
              aria-pressed={scope === scopeOption}
              onClick={() => {
                setScope(scopeOption);
                onScopeChange?.();
              }}
              className={`rounded px-3 py-1 text-xs font-medium capitalize transition-colors ${
                scope === scopeOption
                  ? "bg-[var(--surface-base)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {scopeOption}
            </button>
          ))}
        </div>
      </div>

      {scope === "workspace" ? (
        <label className="grid max-w-md gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">Workspace ID</span>
          <input
            value={workspaceId}
            onChange={(e) => {
              setWorkspaceId(e.target.value);
              onScopeChange?.();
            }}
            placeholder="Required to load scoped queue"
            aria-label="Workspace ID"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          />
        </label>
      ) : null}

      {showCohort ? (
        <label className="grid max-w-xs gap-1 text-xs">
          <span className="font-medium text-[var(--text-primary)]">Cohort filter</span>
          <select
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            aria-label="Cohort filter"
            className="h-9 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2"
          >
            <option value="">All cohorts</option>
            {HUMAN_QUALITY_CORPUS_COHORTS.map((cohortOption) => (
              <option key={cohortOption} value={cohortOption}>
                {cohortOption}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {scope === "workspace" && !workspaceId ? (
        <p className="text-sm text-[var(--text-muted)]">
          Enter a workspace ID to load a scoped corpus queue and calibration reports.
        </p>
      ) : null}
    </div>
  );
}
