/**
 * Phase 6 / item 43: pick "Continuar de onde parei" from canonical work list.
 * Prefers in-progress funnel states, then most recently updated in-progress work.
 * approved/delivered are re-openable via recent list, not "where I left off".
 */
import type { CanonicalWorkSummary } from "@/server/creative-work/canonical/types";

export type ContinueWorkTarget =
  | {
      kind: "work";
      href: string;
      name: string;
      state: string;
      originKind: string;
      originId: string;
    }
  | { kind: "empty" };

/** Funnel stages that mean the user still has work in flight (canonical vocabulary). */
const IN_PROGRESS = new Set([
  "intending",
  "briefing",
  "generating",
  "reviewing",
]);

export function resolveContinueWork(
  works: CanonicalWorkSummary[]
): ContinueWorkTarget {
  const inFlight = works.filter(
    (w) => w.resumable && IN_PROGRESS.has(w.state)
  );
  if (inFlight.length === 0) {
    return { kind: "empty" };
  }

  const sorted = [...inFlight].sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0
  );

  const pick = sorted[0];

  return {
    kind: "work",
    href: pick.resumeHref,
    name: pick.name,
    state: pick.state,
    originKind: pick.originKind,
    originId: pick.originId,
  };
}
