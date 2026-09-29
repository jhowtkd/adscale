import { z } from "zod";
import { err, ok, type Result } from "../domain";
import type { AccountScope, EquipeEvent, EquipeRepositories } from "../data";
import type { AgentTaskResult, EquipeModuleDeps } from "./ports";
import { authorizeAccountExecution } from "./execution-authorization";
import { appendEvent, scopeOf, transact, versionHash, type CommandContext, type TxBase } from "./shared";
import { AGENT_WORK_REQUESTED_EVENT } from "./item-shared";
import { editCaptionInTx, recordCaptionTriageInTx } from "./items-adjust";
import { proposeNewScheduleInTx } from "./items-deadline";
import { createExceptionInternal, SUPPORT_EXCEPTION_OPENED_EVENT } from "./exceptions";
import { loadRoundItemState, requireOpenRound } from "./calibration-round-access";
import {
  WORK_TASKS, workKind, captionReviewSchema, adjustmentResultSchema, replacementResultSchema,
  scheduleResultSchema, claimAgentWorkPayloadSchema, completeAgentWorkPayloadSchema, submitItemVersionPayloadSchema,
  type WorkKind,
} from "./agent-work-contract";

export const WORK_STARTED = "agent_work.started";
export const WORK_COMPLETED = "agent_work.completed";
export const WORK_DEFERRED = "agent_work.deferred";
export const ITEM_REVIEWED = "item.reviewed";

function activeClaims(events: EquipeEvent[]) {
  // A deferral without claimId records a refused claim and releases nothing.
  const deferred = new Set(events.filter((event) => event.eventType === WORK_DEFERRED)
    .map((event) => (event.payload as { claimId?: string | null }).claimId).filter(Boolean));
  return events.filter((event) => event.eventType === WORK_STARTED && !deferred.has(event.id));
}

// ponytail: scans account history for the pilot; use indexed work state if event volume grows.
export async function pendingAgentWork(repos: EquipeRepositories, scope: AccountScope) {
  if (!(await authorizeAccountExecution(repos, scope)).ok) return [];
  const events = await repos.events.list(scope);
  const started = new Set([...activeClaims(events), ...events.filter((e) => [WORK_COMPLETED, "agent.turn_failed"].includes(e.eventType))]
    .map((e) => (e.payload as { sourceEventId?: string } | null)?.sourceEventId));
  // Generation = deferrals of that source: the transport id changes only after a resume.
  const generations = new Map<string, number>();
  for (const e of events) {
    if (e.eventType !== WORK_DEFERRED) continue;
    const id = (e.payload as { sourceEventId?: string } | null)?.sourceEventId;
    if (id) generations.set(id, (generations.get(id) ?? 0) + 1);
  }
  return events.filter((e) => e.eventType === AGENT_WORK_REQUESTED_EVENT && !started.has(e.id))
    .map((e) => ({ ...e, generation: generations.get(e.id) ?? 0 }));
}

async function workState(ctx: CommandContext, sourceEventId: string): Promise<Result<{
  source: EquipeEvent; kind: WorkKind; detail: Record<string, unknown>;
  completed: EquipeEvent | undefined; started: EquipeEvent | undefined;
  deferred: EquipeEvent[];
}>> {
  const scope = scopeOf(ctx);
  // Lock the immutable source row, not a transaction held open during a model call.
  const source = await ctx.repos.events.get(scope, sourceEventId, { forUpdate: true });
  if (!source || source.eventType !== AGENT_WORK_REQUESTED_EVENT || source.objectType !== "item" || !source.objectId) {
    return err("unknown_agent_work", "unknown item work request");
  }
  const detail = (source.payload ?? {}) as Record<string, unknown>;
  const kind = workKind(detail.kind);
  if (!kind) return err("unknown_work_kind", `unknown work kind: ${String(detail.kind)}`);
  const events = await ctx.repos.events.list(scope, { objectType: "agent_work", objectId: source.id });
  const completed = events.find((e) => e.eventType === WORK_COMPLETED);
  const started = activeClaims(events)[0];
  return ok({ source, kind, detail, completed, started, deferred: events.filter((e) => e.eventType === WORK_DEFERRED) });
}

async function complete(ctx: CommandContext, sourceEventId: string, data: Record<string, unknown>) {
  await appendEvent(ctx, { eventType: WORK_COMPLETED, objectType: "agent_work", objectId: sourceEventId,
    payload: { sourceEventId, ...data } });
  return ok(data);
}

export async function runClaimAgentWork(deps: EquipeModuleDeps, base: TxBase, payload: z.infer<typeof claimAgentWorkPayloadSchema>) {
  return transact(deps, base, async (ctx) => {
    const allowed = await authorizeAccountExecution(ctx.repos, scopeOf(ctx), { forUpdate: true });
    if (!allowed.ok) return allowed;
    const state = await workState(ctx, payload.sourceEventId);
    if (!state.ok) return state;
    const { source, kind, detail, started, completed } = state.value;
    if (completed) return ok({ claimed: false, duplicate: true });
    if (started) {
      const claim = started.payload as { runId: string; task: unknown; result?: AgentTaskResult };
      return ok({ claimed: claim.runId === payload.runId, task: claim.task, result: claim.result });
    }
    const scope = scopeOf(ctx);
    const item = await ctx.repos.items.get(scope, source.objectId!, { forUpdate: true });
    const expectedStates = kind === "replacement_proposal" ? ["do_not_publish"]
      : kind === "reschedule_proposal" ? ["missed_window", "failed"]
        : kind === "calibration_correction" ? ["awaiting_approval", "adjusting", "held", "missed_window"] : ["adjusting"];
    if (!item || !item.currentVersionHash || !expectedStates.includes(item.status)
      || (detail.versionHash && detail.versionHash !== item.currentVersionHash)) {
      return complete(ctx, source.id, { claimed: false, stale: true });
    }
    const version = await ctx.repos.itemVersions.getByHash(scope, item.id, item.currentVersionHash);
    if (!version) return err("unknown_version", "item has no current version");
    let roundId: string | undefined;
    if (kind === "calibration_correction") {
      roundId = z.string().uuid().parse(detail.roundId);
      const opened = await requireOpenRound(ctx, roundId, { allowScopeDecision: true });
      if (!opened.ok) return complete(ctx, source.id, { claimed: false, stale: true });
      const state = await loadRoundItemState(ctx, opened.value.round, item.id);
      if (!state.ok || !state.value.quality.returned || state.value.quality.released ||
          state.value.quality.critical || state.value.quality.withdrawn) {
        return complete(ctx, source.id, { claimed: false, stale: true });
      }
    }
    if (kind === "calibration_correction" || (kind === "adjustment" && detail.category === "visual")) {
      // A new date keeps the same human work open, without opening another case.
      const opened = await ctx.repos.events.list(scope, { eventType: SUPPORT_EXCEPTION_OPENED_EVENT });
      const linked = new Set(opened.filter((event) => {
        const payload = event.payload as { itemId?: string; roundId?: string; trigger?: string } | null;
        return payload?.itemId === item.id && payload.trigger === "production_fix" && payload.roundId === roundId;
      }).map((event) => event.objectId));
      const existing = (await ctx.repos.exceptions.list(scope)).find((row) => linked.has(row.id) && row.status !== "closed");
      if (existing) return complete(ctx, source.id, { claimed: false, human: true, exceptionId: existing.id });
      const exception = await createExceptionInternal(ctx, {
        trigger: "production_fix", sourceEventId: source.id, itemId: item.id, workId: item.creativeWorkId, roundId,
        reason: `${roundId ? `Correção de calibração (rodada ${roundId})` : "Ajuste visual"} precisa de nova Peça no Trabalho ${item.creativeWorkId} (item ${item.id}). ${String(detail.note ?? "")}`,
      });
      if (!exception.ok) return exception;
      return complete(ctx, source.id, { claimed: false, human: true, exceptionId: exception.value.id });
    }
    let imageUrl: string | undefined;
    if (kind === "caption_revalidation" && detail.reviewVisual === true) {
      const output = version.creativeWorkOutputId ? await deps.gateway.getCreativeWorkOutput(version.creativeWorkOutputId) : null;
      if (!output || output.workspaceId !== ctx.workspaceId || output.workId !== item.creativeWorkId || !output.imageUrl) {
        return err("review_media_unavailable", "submitted Peça has no reviewable media in this Trabalho");
      }
      imageUrl = output.imageUrl;
    }
    // Only approved, sustained facts of this account enter the model context.
    const contexts = (await ctx.repos.contexts.list(scope)).filter((row) => row.status === "approved");
    const facts = contexts.flatMap((row) => Object.values((row.fields ?? {}) as Record<string, { status?: string; value?: unknown }>)
      .filter((field) => field.status === "sustained").map((field) => JSON.stringify(field.value)));
    const task = { kind: WORK_TASKS[kind], workspaceId: ctx.workspaceId, accountId: ctx.accountId,
      input: { caption: version.caption ?? "", facts, ...(imageUrl ? { imageUrl } : {}), note: String(detail.note ?? detail.reason ?? ""), now: ctx.now.toISOString(),
        scheduledFor: version.scheduledFor?.toISOString() ?? null } };
    // Reuse a completed call only while its item and authorized context still
    // match. Schedule proposals also depend on the clock at resumption.
    const inputHash = versionHash({ ...task.input, now: kind === "reschedule_proposal" ? task.input.now : undefined });
    const saved = state.value.deferred.map((event) => event.payload as { versionHash?: string; inputHash?: string; result?: AgentTaskResult })
      .find((entry) => entry.versionHash === item.currentVersionHash && entry.inputHash === inputHash && entry.result);
    await appendEvent(ctx, { eventType: WORK_STARTED, objectType: "agent_work", objectId: source.id,
      payload: { sourceEventId: source.id, runId: payload.runId, versionHash: item.currentVersionHash, inputHash, task, result: saved?.result } });
    return ok({ claimed: true, task, result: saved?.result });
  });
}

/** Release only this run's claim on suspension. Cleanup metadata is allowed
 * while blocked; no item/context read, model call or client delivery happens.
 */
export async function deferAgentWork(
  deps: EquipeModuleDeps, scope: AccountScope, sourceEventId: string, runId: string, result?: AgentTaskResult,
) {
  return transact(deps, { ...scope, actor: { kind: "system", job: "equipe-agent-work" }, now: deps.clock.now() }, async (ctx) => {
    const state = await workState(ctx, sourceEventId);
    if (!state.ok) return state;
    const { started, completed } = state.value;
    const claim = started?.payload as { runId: string; versionHash: string; inputHash?: string; result?: AgentTaskResult } | undefined;
    if (completed || !started || claim?.runId !== runId) return ok({ deferred: false });
    await appendEvent(ctx, { eventType: WORK_DEFERRED, objectType: "agent_work", objectId: sourceEventId,
      payload: { sourceEventId, claimId: started.id, versionHash: claim.versionHash, inputHash: claim.inputHash, result: result ?? claim.result } });
    return ok({ deferred: true });
  });
}

/** Claim refused by the execution gate: no claim exists, but the transport
 * generation must advance so the resume is not swallowed by Inngest's dedupe.
 * Idempotent per runId, so a replay of the same run adds no generation.
 */
export async function deferRefusedClaim(deps: EquipeModuleDeps, scope: AccountScope, sourceEventId: string, runId: string) {
  return transact(deps, { ...scope, actor: { kind: "system", job: "equipe-agent-work" }, now: deps.clock.now() }, async (ctx) => {
    const state = await workState(ctx, sourceEventId);
    if (!state.ok) return state;
    if (state.value.completed) return ok({ deferred: false });
    if (state.value.deferred.some((event) => (event.payload as { runId?: string }).runId === runId)) return ok({ deferred: false });
    await appendEvent(ctx, { eventType: WORK_DEFERRED, objectType: "agent_work", objectId: sourceEventId,
      payload: { sourceEventId, claimId: null, reason: "claim_refused", runId } });
    return ok({ deferred: true });
  });
}

export async function runCompleteAgentWork(deps: EquipeModuleDeps, base: TxBase, payload: z.infer<typeof completeAgentWorkPayloadSchema>) {
  return transact(deps, base, async (ctx) => {
    const allowed = await authorizeAccountExecution(ctx.repos, scopeOf(ctx), { forUpdate: true });
    if (!allowed.ok) return allowed;
    const state = await workState(ctx, payload.sourceEventId);
    if (!state.ok) return state;
    const { source, kind, completed, started } = state.value;
    if (completed) return ok({ duplicate: true });
    const claim = started?.payload as { runId?: string; versionHash?: string } | undefined;
    if (!claim || claim.runId !== payload.runId) return err("work_not_claimed", "work is not owned by this run");
    if (payload.refusal) return complete(ctx, source.id, { refused: true, reason: payload.refusal });
    const scope = scopeOf(ctx);
    const item = await ctx.repos.items.get(scope, source.objectId!, { forUpdate: true });
    if (!item || item.currentVersionHash !== claim.versionHash) return complete(ctx, source.id, { stale: true });
    let applied;
    switch (kind) {
      case "calibration_correction":
        return err("human_work_only", "calibration correction resumes through submit_corrected_version and Quality");
      case "caption_revalidation": {
        const review = captionReviewSchema.parse(payload.output);
        if (item.status !== "adjusting") return complete(ctx, source.id, { stale: true });
        // Findings are appended against the exact immutable version and joined on reads.
        await appendEvent(ctx, { eventType: ITEM_REVIEWED, objectType: "item", objectId: item.id,
          payload: { sourceEventId: source.id, versionHash: claim.versionHash, ...review,
            blocked: review.findings.some((f) => f.severity === "blocking"),
            warnings: review.findings.filter((f) => f.severity === "warning").map((f) => f.message) } });
        applied = await recordCaptionTriageInTx(ctx, {
          itemId: item.id, expectedVersionHash: claim.versionHash, natures: review.natures,
          warnings: review.findings.filter((f) => f.severity === "warning").slice(0, 10).map((f) => f.message.slice(0, 500)),
          qualityRecheckPassed: false,
        });
        break;
      }
      case "adjustment": {
        const result = adjustmentResultSchema.parse(payload.output);
        if (item.status !== "adjusting") return complete(ctx, source.id, { stale: true });
        applied = await editCaptionInTx(ctx, { itemId: item.id, caption: result.caption });
        break;
      }
      case "replacement_proposal": {
        const proposal = replacementResultSchema.parse(payload.output);
        if (item.status !== "do_not_publish") return complete(ctx, source.id, { stale: true });
        const idea = await ctx.repos.ideas.create(scope, { kind: "content", status: "proposed",
          payload: { ...proposal, replacesItemId: item.id, creativeWorkId: item.creativeWorkId } });
        await appendEvent(ctx, { eventType: "idea.proposed", objectType: "idea", objectId: idea.id,
          payload: { sourceEventId: source.id, itemId: item.id } });
        applied = ok({ ideaId: idea.id });
        break;
      }
      case "reschedule_proposal": {
        const result = scheduleResultSchema.parse(payload.output);
        if (!["missed_window", "failed"].includes(item.status)) return complete(ctx, source.id, { stale: true });
        applied = await proposeNewScheduleInTx(ctx, { itemId: item.id, scheduledFor: new Date(result.scheduledFor) });
        break;
      }
    }
    if (!applied.ok) return applied;
    return complete(ctx, source.id, { kind, ...applied.value });
  });
}

/** After the engine creates a new Peça, submit it to the same version/review path. */
export async function runSubmitItemVersion(deps: EquipeModuleDeps, base: TxBase, payload: z.infer<typeof submitItemVersionPayloadSchema>) {
  return transact(deps, base, async (ctx) => {
    const allowed = await authorizeAccountExecution(ctx.repos, scopeOf(ctx), { forUpdate: true });
    if (!allowed.ok) return allowed;
    const item = await ctx.repos.items.get(scopeOf(ctx), payload.itemId, { forUpdate: true });
    if (!item || item.currentVersionHash !== payload.expectedVersionHash) return err("version_mismatch", "item changed");
    if (payload.creativeWorkOutputId) {
      const output = await deps.gateway.getCreativeWorkOutput(payload.creativeWorkOutputId);
      if (!output || output.workspaceId !== ctx.workspaceId || output.workId !== item.creativeWorkId) {
        return err("output_work_mismatch", "output must belong to this item's Trabalho");
      }
    }
    return editCaptionInTx(ctx, payload, payload.creativeWorkOutputId);
  });
}
