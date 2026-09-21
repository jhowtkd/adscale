import { createHash } from "node:crypto";
import { artRefinementParentHash } from "@/server/creative-work/art-refinement-parent-hash";
import { getCreativeWorkObjectiveVerdict, getCreativeWorkSelectionPolicy } from "@/lib/creative-work-selection-policy";
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
import {
  artComparisonKey,
  chooseBestCandidate,
  resolveArtCritique,
  resolveArtRefinementState,
  shouldRefine,
  type ArtComparisonVerdict,
  type ArtCritique,
  type RefinementCandidate,
} from "@/server/creative-work/art-refinement";
import { resolveCreativeWorkArtRefinement } from "@/server/creative-work/contracts";
import {
  carouselAnchorPositions,
  resolveCarouselPreparedSnapshot,
} from "@/server/creative-work/carousel-contracts";
import {
  ART_COMPARISON_JUDGE_FAILED_REASON,
  compareArtCandidates,
} from "@/server/generation/pipeline/post-generation";
import {
  getArtRefinementAttemptByKey,
  getCreativeWork,
  listArtRefinementAttempts,
  markArtRefinementAttempt,
  setArtRefinementState,
} from "@/server/repositories/creative-work";
import {
  claimArtRefinementSlideAttempt,
  claimArtRefinementSlideUnits,
  listCarouselSlideLineage,
  listCurrentCarouselSlides,
} from "@/server/repositories/creative-work-carousel";
import type { CreativeWorkCarouselSlide } from "@/server/db/schema";
import { loadArtComparisonImage, buildArtRevisionInstruction } from "./refine-creative-work";
import { reviseCarouselSlide } from "./revise-carousel";

export type RefineCarouselSlideResult = {
  kind: "started" | "stopped" | "replay";
  /** Slide id of the dispatched revision, when one started or replayed. */
  outputId: string | null;
  reason: string;
};

const INCONCLUSIVE_CRITIQUE: ArtCritique = {
  verdict: "inconclusive",
  problem: "",
  intervention: "",
  mode: "edit",
  preserve: [],
  evidence: [],
  confidence: "low",
};

function lineageRootId(versions: readonly CreativeWorkCarouselSlide[]): string | null {
  let root: CreativeWorkCarouselSlide | null = null;
  for (const version of versions) {
    if (!root || version.versionNumber < root.versionNumber) root = version;
  }
  return root?.id ?? null;
}

function toRefinementCandidate(slide: CreativeWorkCarouselSlide): RefinementCandidate {
  const policy = getCreativeWorkSelectionPolicy(slide.quality, slide.id);
  return {
    id: slide.id,
    objective: getCreativeWorkObjectiveVerdict(slide.quality) ?? "inconclusive",
    humanReviewRequired: !policy.selectable || policy.requiresConfirmation,
    critique: resolveArtCritique(
      slide.quality && typeof slide.quality === "object"
        ? (slide.quality as Record<string, unknown>).artCritique
        : null,
    ) ?? INCONCLUSIVE_CRITIQUE,
  };
}

function briefHash(brief: string): string {
  return createHash("sha256").update(brief).digest("hex").slice(0, 16);
}

/**
 * Recompute the work-level presentation summary after a slide refinement
 * event: the best valid slide per lineage (compared pairwise with the
 * multimodal judge when both images load, structural otherwise — ties keep
 * the previous version), "running" while any slide or attempt is in flight,
 * else "ready" when every lineage has a best, "needs_review" when some
 * lineage has none. Recommended ids are slide ids on carousel works. Never
 * promotes a rejected slide.
 *
 * Judged verdicts persist in the state (`comparisons`) keyed by the immutable
 * pair plus brief hash, so each unique pair is judged once across refreshes;
 * images are only loaded for pairs that still need a verdict. Verdicts from
 * a failed judge or without both images stay unpersisted so a later refresh
 * can retry them.
 */
export async function refreshCarouselArtRefinementState(input: {
  workspaceId: string;
  workItemId: string;
}): Promise<void> {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!aggregate || aggregate.work.toolKind !== "carousel") return;
  const budget = resolveCreativeWorkArtRefinement(aggregate.work.inputSnapshot);
  if (!budget) return;

  const attempts = await listArtRefinementAttempts(input.workspaceId, input.workItemId);
  const inFlightAttempt = attempts.some(
    (attempt) => attempt.status === "claimed" || attempt.status === "dispatched",
  );
  const current = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);
  const inFlightSlide = current.some(
    (slide) => slide.status === "draft" || slide.status === "queued" || slide.status === "processing",
  );
  const brief = aggregate.work.inputSnapshot?.request ?? aggregate.work.request;
  const hash = briefHash(brief);
  const priorComparisons = resolveArtRefinementState(aggregate.work.artRefinementState)?.comparisons ?? {};
  const comparisons: Record<string, ArtComparisonVerdict> = {};

  const lineages = await Promise.all(current.map((slide) =>
    listCarouselSlideLineage(input.workspaceId, input.workItemId, slide.lineageId),
  ));

  const recommendedOutputIds: string[] = [];
  const issues: string[] = [];
  for (const lineage of lineages) {
    const versions = lineage
      .filter((version) => version.status === "completed" && version.outputKey)
      .sort((a, b) => a.versionNumber - b.versionNumber);
    if (versions.length === 0) continue;
    const candidates = versions.map(toRefinementCandidate);
    const outputKeyById = new Map(versions.map((version) => [version.id, version.outputKey]));
    const imageById = new Map<string, Promise<Buffer | undefined>>();
    const imageOf = (id: string): Promise<Buffer | undefined> => {
      let pending = imageById.get(id);
      if (!pending) {
        pending = loadArtComparisonImage(outputKeyById.get(id) ?? null);
        imageById.set(id, pending);
      }
      return pending;
    };
    let preferredId: string | null = null;
    let best = candidates[0]!;
    for (const next of candidates.slice(1)) {
      const key = artComparisonKey(best.id, next.id, hash);
      const cached = priorComparisons[key];
      if (cached) {
        comparisons[key] = cached;
        preferredId = cached.preferredId;
      } else {
        const [beforeImage, afterImage] = await Promise.all([imageOf(best.id), imageOf(next.id)]);
        const comparison = await compareArtCandidates({
          before: best,
          after: next,
          brief,
          beforeImage,
          afterImage,
        });
        preferredId = comparison.preferredId;
        if (beforeImage && afterImage && comparison.reason !== ART_COMPARISON_JUDGE_FAILED_REASON) {
          comparisons[key] = { preferredId: comparison.preferredId };
        }
      }
      best = candidates.find((candidate) => candidate.id === preferredId) ?? best;
    }
    const winner = chooseBestCandidate(candidates, preferredId);
    if (winner) {
      recommendedOutputIds.push(winner.id);
    } else {
      const latest = candidates[candidates.length - 1]!;
      if (latest.critique.verdict === "weak" && latest.critique.problem) {
        issues.push(latest.critique.problem.slice(0, 300));
      }
    }
  }

  const status = inFlightAttempt || inFlightSlide
    ? "running"
    : recommendedOutputIds.length > 0 && issues.length === 0
      ? "ready"
      : recommendedOutputIds.length === 0
        ? "needs_review"
        : "ready";
  const openIssues = issues.length > 0 ? issues.slice(0, 10) : (
    status === "needs_review" ? ["Nenhuma versão válida disponível."] : []
  );
  await setArtRefinementState(input.workspaceId, input.workItemId, {
    recommendedOutputIds,
    status,
    issues: openIssues,
    comparisons,
  });
}

/**
 * Coordinate one automatic art revision after a terminal slide (plan 04,
 * T4). Same contract as the single-output coordinator: the frozen budget
 * authorizes and pays; calibration works, legacy snapshots, unready slides
 * and unactionable critiques stop without any write beyond the presentation
 * summary. Revising an anchor reserves every dependent rebuild in the same
 * transaction first — an anchor is never authorized cheaply with its
 * dependents left outside the budget.
 */
export async function refineCarouselSlide(input: {
  workspaceId: string;
  workItemId: string;
  rootSlideId: string;
  completedSlideId: string;
}): Promise<RefineCarouselSlideResult> {
  const stopped = (reason: string): RefineCarouselSlideResult =>
    ({ kind: "stopped", outputId: null, reason });

  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!aggregate) return stopped("work_not_found");
  if (aggregate.work.toolKind !== "carousel") return stopped("wrong_surface");
  // Calibration works never refine automatically — the human loop owns them.
  if (aggregate.work.trainingSessionId) return stopped("calibration_excluded");
  const budget = resolveCreativeWorkArtRefinement(aggregate.work.inputSnapshot);
  if (!budget) return stopped("no_budget");
  const snapshot = resolveCarouselPreparedSnapshot(aggregate.work.inputSnapshot);
  if (!snapshot) return stopped("stale_input");

  const current = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);
  const completed = current.find((slide) => slide.id === input.completedSlideId);
  if (!completed || completed.status !== "completed" || !completed.outputKey) {
    return stopped("slide_not_ready");
  }
  const lineage = await listCarouselSlideLineage(input.workspaceId, input.workItemId, completed.lineageId);
  if (lineageRootId(lineage) !== input.rootSlideId) {
    return stopped("root_mismatch");
  }

  const attempts = await listArtRefinementAttempts(input.workspaceId, input.workItemId);
  const usedRevisions = attempts.filter(
    (attempt) => attempt.rootSlideId === input.rootSlideId,
  ).length;

  const critique = resolveArtCritique(
    completed.quality && typeof completed.quality === "object"
      ? (completed.quality as Record<string, unknown>).artCritique
      : null,
  );
  if (!critique) {
    await refreshCarouselArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
    return stopped("no_actionable_critique");
  }
  const objective = getCreativeWorkObjectiveVerdict(completed.quality);
  // The canonical selection gate owns identity/anatomy blocks: a confirmed
  // mismatch or an unresolved doubt stops here like any other block.
  const policy = getCreativeWorkSelectionPolicy(completed.quality, completed.id);
  if (!policy.selectable || policy.requiresConfirmation) {
    await refreshCarouselArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
    return stopped("selection_blocked");
  }
  if (!shouldRefine({ critique, usedRevisions, isCalibration: false, objective: objective ?? "inconclusive" })) {
    await refreshCarouselArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
    return stopped("gate_closed");
  }

  const unitCredits = GENERATION_CREDIT_COSTS.creativeWorkOutput;
  // Conservative remaining budget: every current slide counts as charged,
  // even failed ones (a refund only makes this stop earlier, never overspend).
  const remainingCreditCeiling = budget.acceptedCreditCeiling - current.length * unitCredits;

  const anchorPositions = new Set<number>(carouselAnchorPositions(snapshot.deck.slides.length));
  const revisingAnchor = anchorPositions.has(completed.position);
  let claims: Array<{ attempt: number; revisionKey: string; replay: boolean }>;
  if (!revisingAnchor) {
    const claim = await claimArtRefinementSlideAttempt({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      rootSlideId: input.rootSlideId,
      parentSlideId: completed.id,
      expectedParentHash: artRefinementParentHash(completed),
      unitCredits,
      remainingCreditCeiling,
    });
    if (!claim) {
      await refreshCarouselArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
      return stopped("claim_refused");
    }
    claims = [claim];
  } else {
    // Dependent roots come from live lineage rows — never the browser.
    // Every dependent must be terminally completed: revising the board
    // while a dependent is undispatched, in flight or failed would orphan
    // it, so automation interrupts with an explicit pending state instead.
    const dependents: Array<{ rootSlideId: string; parentSlideId: string; expectedParentHash: string }> = [];
    for (const slide of current) {
      if (anchorPositions.has(slide.position)) continue;
      if (slide.status !== "completed" || !slide.outputKey) {
        await refreshCarouselArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
        return stopped("dependents_not_ready");
      }
      const dependentLineage = await listCarouselSlideLineage(
        input.workspaceId, input.workItemId, slide.lineageId,
      );
      const dependentRootId = lineageRootId(dependentLineage);
      if (!dependentRootId) {
        await refreshCarouselArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
        return stopped("dependents_not_ready");
      }
      dependents.push({
        rootSlideId: dependentRootId,
        parentSlideId: slide.id,
        expectedParentHash: artRefinementParentHash(slide),
      });
    }
    const claimed = await claimArtRefinementSlideUnits({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      anchor: {
        rootSlideId: input.rootSlideId,
        parentSlideId: completed.id,
        expectedParentHash: artRefinementParentHash(completed),
      },
      dependents,
      unitCredits,
      remainingCreditCeiling,
    });
    if (!claimed) {
      await refreshCarouselArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
      return stopped("claim_refused");
    }
    claims = claimed;
  }

  const anchorClaim = claims[0]!;
  if (anchorClaim.replay) {
    const existing = await getArtRefinementAttemptByKey(input.workspaceId, anchorClaim.revisionKey);
    // A replay whose dispatch never happened reconciles by dispatching now
    // under the same idempotent revision key — never by charging twice.
    // Dependent propagation inside the revise call is idempotent too.
    if (existing?.slideId) {
      return { kind: "replay", outputId: existing.slideId, reason: "already_claimed" };
    }
  }

  let revised: Awaited<ReturnType<typeof reviseCarouselSlide>>;
  try {
    revised = await reviseCarouselSlide({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      // Author and limit come from the frozen budget, never the job/event.
      userId: budget.acceptedBy,
      slideId: completed.id,
      expectedVersion: completed.versionNumber,
      revisionKey: anchorClaim.revisionKey,
      kind: "visual",
      instruction: buildArtRevisionInstruction(critique),
    });
  } catch {
    // Unknown outcome (crash before/after the charge): leave the attempts
    // claimed so the next event reconciles through the same revision key.
    throw new Error("art_refinement_dispatch_unknown");
  }
  if (!revised.ok) {
    // A deterministic failure consumes the opportunity; credits follow the
    // canonical settlement refund, never a third attempt.
    for (const claim of claims) {
      await markArtRefinementAttempt(input.workspaceId, claim.revisionKey, { status: "failed" });
    }
    await refreshCarouselArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
    return stopped("dispatch_failed");
  }
  await markArtRefinementAttempt(input.workspaceId, anchorClaim.revisionKey, {
    status: "dispatched",
    slideId: revised.value.slide.id,
  });
  for (const claim of claims.slice(1)) {
    await markArtRefinementAttempt(input.workspaceId, claim.revisionKey, { status: "dispatched" });
  }
  await refreshCarouselArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
  return {
    kind: anchorClaim.replay ? "replay" : "started",
    outputId: revised.value.slide.id,
    reason: "revision_dispatched",
  };
}
