import type { LocalLearningPromptContext } from "@/server/brand-taste/prompt-calibration-loader";
import type { AgentTask, EquipeModuleDeps } from "../module/ports";
import { assertAccountExecution } from "../module/execution-authorization";
import { itemWorkFixedPrompt } from "./item-work";

export type FrozenCaptionGuidance = {
  sourceEventId: string; itemId: string; versionHash: string;
  system: string; fixedPromptVersion: string;
  selection: LocalLearningPromptContext;
};

/** Durable unit: one requested adjustment over its immutable expected Item Version.
 * Lock the source before reading the snapshot, including on retry/resumption.
 * The model call occurs after this transaction commits.
 */
export async function freezeCaptionGuidance(deps: EquipeModuleDeps, task: AgentTask): Promise<FrozenCaptionGuidance | undefined> {
  if (!task.sourceEventId) return undefined; // Historical direct tasks have no trustworthy unit identity.
  return deps.uow.run(async repos => {
    await assertAccountExecution(repos, task);
    const source = await repos.events.get(task, task.sourceEventId!, { forUpdate: true });
    const detail = source?.payload as { kind?: string; versionHash?: string; category?: string } | undefined;
    if (!source || source.eventType !== "agent_work.requested" || source.objectType !== "item" || !source.objectId ||
      detail?.kind !== "adjustment" || detail.category === "visual" || !detail.versionHash) throw new Error("invalid_caption_guidance_unit");
    const item = await repos.items.get(task, source.objectId, { forUpdate: true });
    const version = await repos.itemVersions.getByHash(task, source.objectId, detail.versionHash);
    if (!item || item.status !== "adjusting" || item.currentVersionHash !== detail.versionHash || !version ||
      (task.input as { caption?: string }).caption !== (version.caption ?? "")) throw new Error("stale_caption_guidance_unit");
    const events = await repos.events.list(task, { objectType: "agent_work", objectId: source.id });
    const existing = events.find(e => e.eventType === "agent.learned_guidance_frozen");
    if (existing) return structuredClone(existing.payload) as FrozenCaptionGuidance;
    const account = await repos.accounts.get(task.workspaceId, task.accountId);
    const fixed = itemWorkFixedPrompt("plan_adjustment");
    const work = item.creativeWorkId ? await deps.gateway.getCreativeWork(item.creativeWorkId) : null;
    const output = version.creativeWorkOutputId ? await deps.gateway.getCreativeWorkOutput(version.creativeWorkOutputId) : null;
    // The pinned Peça determines the format; never borrow another output's scope.
    const format = version.creativeWorkOutputId
      ? output?.workspaceId === task.workspaceId && output.workId === item.creativeWorkId ? output.targetFormat : undefined
      : work?.format;
    const eligible = work?.workspaceId === task.workspaceId && work.clientProfileId === account?.clientProfileId && work.generationMode && format;
    const selection: LocalLearningPromptContext = eligible && deps.gateway.loadLearnedGuidance ? await deps.gateway.loadLearnedGuidance({
      workspaceId: task.workspaceId, clientProfileId: account!.clientProfileId,
      role: "caption_adjustment", language: "pt-BR", generationMode: work!.generationMode!, format: format!, fixedPromptVersion: fixed.fixedPromptVersion,
    }) : { lines: [], appliedRefs: [], setHash: null, omissions: [], omissionReason: "local_learning_denied" };
    const frozen: FrozenCaptionGuidance = { sourceEventId: source.id, itemId: item.id, versionHash: detail.versionHash,
      system: [fixed.system, ...selection.lines].join("\n"), fixedPromptVersion: fixed.fixedPromptVersion, selection };
    await repos.events.create(task, { actorType: "system", actorId: "equipe.learned_guidance", actorRole: "system", eventType: "agent.learned_guidance_frozen",
      objectType: "agent_work", objectId: source.id, payload: frozen, occurredAt: deps.clock.now() });
    return structuredClone(frozen);
  });
}

export async function recordCaptionGuidanceApplication(deps: EquipeModuleDeps, task: AgentTask, ledgerEntryId: string) {
  await deps.uow.run(async repos => {
    await assertAccountExecution(repos, task);
    const source = task.sourceEventId && await repos.events.get(task, task.sourceEventId, { forUpdate: true });
    if (!source) throw new Error("invalid_caption_guidance_unit");
    const events = await repos.events.list(task, { objectType: "agent_work", objectId: source.id });
    if (events.some(e => e.eventType === "agent.learned_guidance_applied" &&
      (e.payload as { ledgerEntryId?: string }).ledgerEntryId === ledgerEntryId)) return;
    const snapshot = events.find(e => e.eventType === "agent.learned_guidance_frozen");
    if (!snapshot) throw new Error("missing_caption_guidance_snapshot");
    const frozen = snapshot.payload as FrozenCaptionGuidance;
    await repos.events.create(task, { actorType: "system", actorId: "equipe.learned_guidance", actorRole: "system", eventType: "agent.learned_guidance_applied",
      objectType: "agent_work", objectId: frozen.sourceEventId, occurredAt: deps.clock.now(),
      payload: { sourceEventId: frozen.sourceEventId, itemId: frozen.itemId, versionHash: frozen.versionHash, ledgerEntryId, consumer: "plan_adjustment", role: "caption_adjustment",
        situation: frozen.selection.setHash ? "applied" : frozen.selection.omissionReason || frozen.selection.omissions.length ? "omitted" : "no_guidance",
        appliedRefs: frozen.selection.appliedRefs, setHash: frozen.selection.setHash, fixedPromptVersion: frozen.fixedPromptVersion,
        omissionReason: frozen.selection.omissionReason ?? null, omissions: frozen.selection.omissions } });
  });
}
