/**
 * Phase 6 / item 43: pick "Continuar de onde parei" from canonical work list.
 * Prefers in-progress states, then most recently updated resumable work.
 */
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";

export type ContinueWorkTarget =
  | {
      kind: "work";
      href: string;
      name: string;
      state: string;
      originKind: string;
    }
  | { kind: "empty" };

const IN_PROGRESS = new Set([
  "briefing",
  "generating",
  "reviewing",
  "producing",
  "ready_for_review",
]);

export function resolveContinueWork(
  works: CanonicalWorkSummary[]
): ContinueWorkTarget {
  const resumable = works.filter((w) => w.resumable);
  if (resumable.length === 0) {
    return { kind: "empty" };
  }

  const sorted = [...resumable].sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0
  );

  const hot = sorted.find((w) => IN_PROGRESS.has(w.state));
  const pick = hot ?? sorted[0];

  return {
    kind: "work",
    href: pick.resumeHref,
    name: pick.name,
    state: pick.state,
    originKind: pick.originKind,
  };
}
