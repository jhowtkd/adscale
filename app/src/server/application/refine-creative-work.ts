import { getCreativeWorkObjectiveVerdict, getCreativeWorkSelectionPolicy } from "@/lib/creative-work-selection-policy";
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
import {
  artRefinementParentHash,
  chooseBestCandidate,
  resolveArtCritique,
  shouldRefine,
  type ArtCritique,
  type RefinementCandidate,
} from "@/server/creative-work/art-refinement";
import {
  resolveCreativeWorkArtRefinement,
  type CreativeWorkInputSnapshot,
} from "@/server/creative-work/contracts";
import { resolveCreativeWorkProtocol } from "@/server/creative-work/protocol";
import { compareArtCandidates } from "@/server/generation/pipeline/post-generation";
import {
  claimArtRefinementAttempt,
  getArtRefinementAttemptByKey,
  getCreativeWork,
  listArtRefinementAttempts,
  markArtRefinementAttempt,
  setArtRefinementState,
} from "@/server/repositories/creative-work";
import type { CreativeWorkOutput } from "@/server/db/schema";
import { objectStorage } from "@/server/storage";
import { reviseCreativeWorkOutput } from "./revise-creative-work-output";

export type RefineCreativeWorkResult = {
  kind: "started" | "stopped" | "replay";
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

function chainRootId(outputs: readonly CreativeWorkOutput[], outputId: string): string | null {
  const byId = new Map(outputs.map((output) => [output.id, output]));
  let current = byId.get(outputId);
  if (!current) return null;
  const seen = new Set<string>();
  while (current?.parentOutputId) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    const parent = byId.get(current.parentOutputId);
    if (!parent) return null;
    current = parent;
  }
  return current?.id ?? null;
}

function chainOutputs(outputs: readonly CreativeWorkOutput[], rootId: string): CreativeWorkOutput[] {
  const children = new Map<string, CreativeWorkOutput[]>();
  for (const output of outputs) {
    if (!output.parentOutputId) continue;
    const list = children.get(output.parentOutputId) ?? [];
    list.push(output);
    children.set(output.parentOutputId, list);
  }
  const root = outputs.find((output) => output.id === rootId);
  if (!root) return [];
  const chain = [root];
  const queue = [...(children.get(rootId) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift()!;
    chain.push(next);
    queue.push(...(children.get(next.id) ?? []));
  }
  return chain.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function toRefinementCandidate(output: CreativeWorkOutput): RefinementCandidate {
  const policy = getCreativeWorkSelectionPolicy(output.quality, output.id);
  return {
    id: output.id,
    objective: getCreativeWorkObjectiveVerdict(output.quality) ?? "inconclusive",
    humanReviewRequired: !policy.selectable || policy.requiresConfirmation,
    critique: resolveArtCritique(
      output.quality && typeof output.quality === "object"
        ? (output.quality as Record<string, unknown>).artCritique
        : null,
    ) ?? INCONCLUSIVE_CRITIQUE,
  };
}

/** Shared revision instruction: defect + intervention + preserve + evidence. */
export function buildArtRevisionInstruction(critique: ArtCritique): string {
  const parts = [
    `Problema: ${critique.problem}`,
    `Intervenção: ${critique.intervention}`,
  ];
  if (critique.preserve.length > 0) parts.push(`Preservar: ${critique.preserve.join("; ")}`);
  if (critique.evidence.length > 0) parts.push(`Evidência: ${critique.evidence.join("; ")}`);
  return parts.join(" ").slice(0, 2000);
}

/**
 * Best-effort comparison image load: a missing/unreadable artifact degrades
 * that pair to the structural tie (previous version wins, no model call).
 * Comparison must never fail the presentation summary — or the terminal
 * job step that calls it — because bytes are unavailable.
 */
export async function loadArtComparisonImage(outputKey: string | null): Promise<Buffer | undefined> {
  if (!outputKey) return undefined;
  try {
    return await objectStorage.get(outputKey);
  } catch {
    return undefined;
  }
}

/**
 * Recompute the work-level presentation summary after a refinement event:
 * the best valid output per initial root (compared pairwise with the
 * multimodal judge when both images load, structural otherwise — ties keep
 * the previous version), "running" while any output or attempt is in flight,
 * else "ready" when every root has a best, "needs_review" when some root
 * has none. Never promotes a rejected output.
 */
export async function refreshArtRefinementState(input: {
  workspaceId: string;
  workItemId: string;
}): Promise<void> {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!aggregate) return;
  const budget = resolveCreativeWorkArtRefinement(aggregate.work.inputSnapshot);
  if (!budget) return;

  const attempts = await listArtRefinementAttempts(input.workspaceId, input.workItemId);
  const inFlightAttempt = attempts.some(
    (attempt) => attempt.status === "claimed" || attempt.status === "dispatched",
  );
  const inFlightOutput = aggregate.outputs.some(
    (output) => output.status === "queued" || output.status === "processing",
  );
  const brief = aggregate.work.inputSnapshot?.request ?? aggregate.work.request;

  const recommendedOutputIds: string[] = [];
  const issues: string[] = [];
  const roots = aggregate.outputs.filter((output) => !output.parentOutputId);
  for (const root of roots) {
    const chain = chainOutputs(aggregate.outputs, root.id)
      .filter((output) => output.status === "completed" && output.outputKey);
    if (chain.length === 0) continue;
    const candidates = chain.map(toRefinementCandidate);
    const imageById = new Map<string, Buffer | undefined>();
    for (const output of chain) {
      imageById.set(output.id, await loadArtComparisonImage(output.outputKey));
    }
    let preferredId: string | null = null;
    let best = candidates[0]!;
    for (const next of candidates.slice(1)) {
      const comparison = await compareArtCandidates({
        before: best,
        after: next,
        brief,
        beforeImage: imageById.get(best.id),
        afterImage: imageById.get(next.id),
      });
      preferredId = comparison.preferredId;
      best = candidates.find((candidate) => candidate.id === comparison.preferredId) ?? best;
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

  const status = inFlightAttempt || inFlightOutput
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
  });
}

/**
 * Coordinate one automatic art revision after a terminal output (plan 04,
 * T2). The frozen budget authorizes and pays; calibration works, legacy
 * snapshots, unready outputs and unactionable critiques stop without any
 * write beyond the presentation summary. A claim is taken under the work
 * lock BEFORE the canonical revision settlement; a replayed event for an
 * already-claimed attempt reconciles instead of charging twice.
 */
export async function refineCreativeWork(input: {
  workspaceId: string;
  workItemId: string;
  rootOutputId: string;
  completedOutputId: string;
}): Promise<RefineCreativeWorkResult> {
  const stopped = (reason: string): RefineCreativeWorkResult =>
    ({ kind: "stopped", outputId: null, reason });

  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!aggregate) return stopped("work_not_found");
  // Single-output surface only: carousel works refine through
  // refineCarouselSlide (slide claims + visual slide revision), never here.
  if (aggregate.work.toolKind === "carousel") return stopped("wrong_surface");
  // Calibration works never refine automatically — the human loop owns them.
  if (aggregate.work.trainingSessionId) return stopped("calibration_excluded");
  const budget = resolveCreativeWorkArtRefinement(aggregate.work.inputSnapshot);
  if (!budget) return stopped("no_budget");

  const completed = aggregate.outputs.find((output) => output.id === input.completedOutputId);
  if (!completed || completed.status !== "completed" || !completed.outputKey) {
    return stopped("output_not_ready");
  }
  if (chainRootId(aggregate.outputs, completed.id) !== input.rootOutputId) {
    return stopped("root_mismatch");
  }

  const attempts = await listArtRefinementAttempts(input.workspaceId, input.workItemId);
  const usedRevisions = attempts.filter(
    (attempt) => attempt.rootOutputId === input.rootOutputId,
  ).length;

  const critique = resolveArtCritique(
    completed.quality && typeof completed.quality === "object"
      ? (completed.quality as Record<string, unknown>).artCritique
      : null,
  );
  if (!critique) {
    await refreshArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
    return stopped("no_actionable_critique");
  }
  const objective = getCreativeWorkObjectiveVerdict(completed.quality);
  // The canonical selection gate owns identity/anatomy blocks: a confirmed
  // mismatch or an unresolved doubt stops here like any other block.
  const policy = getCreativeWorkSelectionPolicy(completed.quality, completed.id);
  if (!policy.selectable || policy.requiresConfirmation) {
    await refreshArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
    return stopped("selection_blocked");
  }
  if (!shouldRefine({ critique, usedRevisions, isCalibration: false, objective: objective ?? "inconclusive" })) {
    await refreshArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
    return stopped("gate_closed");
  }

  const unitCredits = GENERATION_CREDIT_COSTS.creativeWorkOutput;
  // Conservative remaining budget: every initial output counts as charged,
  // even failed ones (a refund only makes this stop earlier, never overspend).
  const initialOutputs = aggregate.outputs.filter((output) => !output.parentOutputId).length;
  const claim = await claimArtRefinementAttempt({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    rootOutputId: input.rootOutputId,
    parentOutputId: completed.id,
    expectedParentHash: artRefinementParentHash(completed),
    unitCredits,
    remainingCreditCeiling: budget.acceptedCreditCeiling - initialOutputs * unitCredits,
  });
  if (!claim) {
    await refreshArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
    return stopped("claim_refused");
  }
  if (claim.replay) {
    const existing = await getArtRefinementAttemptByKey(input.workspaceId, claim.revisionKey);
    // A replay whose dispatch never happened reconciles by dispatching now
    // under the same idempotent revision key — never by charging twice.
    if (existing?.outputId) {
      return { kind: "replay", outputId: existing.outputId, reason: "already_claimed" };
    }
  }

  const snapshot: CreativeWorkInputSnapshot | null = aggregate.work.inputSnapshot ?? null;
  let protocol: { mode: string } | null = null;
  if (snapshot) {
    try {
      protocol = resolveCreativeWorkProtocol({
        toolKind: aggregate.work.toolKind,
        format: aggregate.work.format,
        targetFormats: snapshot.settings.targetFormats,
      });
    } catch {
      protocol = null;
    }
  }
  let revised: Awaited<ReturnType<typeof reviseCreativeWorkOutput>>;
  try {
    revised = await reviseCreativeWorkOutput({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      // Author and limit come from the frozen budget, never the job/event.
      userId: budget.acceptedBy,
      outputId: completed.id,
      revisionKey: claim.revisionKey,
      instruction: buildArtRevisionInstruction(critique),
      revisionAssetId: null,
      compositionMode: critique.mode,
      protocolMode: protocol?.mode ?? null,
    });
  } catch {
    // Unknown outcome (crash before/after the charge): leave the attempt
    // claimed so the next event reconciles through the same revision key.
    throw new Error("art_refinement_dispatch_unknown");
  }
  if (!revised.ok) {
    // A deterministic failure consumes the opportunity; credits follow the
    // canonical settlement refund, never a third attempt.
    await markArtRefinementAttempt(input.workspaceId, claim.revisionKey, { status: "failed" });
    await refreshArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
    return stopped(revised.error.code === "credit_blocked" ? "credit_blocked" : "dispatch_failed");
  }
  await markArtRefinementAttempt(input.workspaceId, claim.revisionKey, {
    status: "dispatched",
    outputId: revised.value.output.id,
  });
  await refreshArtRefinementState({ workspaceId: input.workspaceId, workItemId: input.workItemId });
  return { kind: claim.replay ? "replay" : "started", outputId: revised.value.output.id, reason: "revision_dispatched" };
}
