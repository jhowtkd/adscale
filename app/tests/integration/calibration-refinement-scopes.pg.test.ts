import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({
  image: vi.fn(), create: vi.fn(), copy: vi.fn(),
  spend: vi.fn(async () => ({ ok: true, creditsSpent: 2 })), send: vi.fn(async () => ({ ids: [] })),
}));
vi.mock("@/server/billing/paywall", async original => ({ ...(await original<typeof import("@/server/billing/paywall")>()), spend: provider.spend }));
vi.mock("@/server/creative-work/copy", async original => ({ ...(await original<typeof import("@/server/creative-work/copy")>()), generateSocialPostCopy: provider.copy }));
vi.mock("@/server/ai/utils", async original => ({ ...(await original<typeof import("@/server/ai/utils")>()), getOpenAI: () => ({ chat: { completions: { create: provider.create } } }) }));
vi.mock("@/server/ai/image-generation", () => ({ isRetryableProviderError: () => false }));
vi.mock("@/server/generation/pipeline/execute", () => ({ executeCanonicalGeneration: provider.image }));
vi.mock("@/server/generation/pipeline/post-generation", () => ({ runCreativeWorkQualityAssessment: async () => ({
  objectiveVerdict: "pass", quality: { schemaVersion: 1, objectiveVerdict: "pass", objectiveCodes: [], attempt: 1, checks: { file: { ok: true } } },
}) }));
vi.mock("@/server/storage", () => ({ objectStorage: {
  put: vi.fn(), delete: vi.fn(),
  get: async () => (await import("sharp")).default({ create: { width: 4, height: 4, channels: 4, background: "#ffffff" } }).png().toBuffer(),
} }));
vi.mock("@/server/creative-work/text-composite", async original => ({
  ...(await original<typeof import("@/server/creative-work/text-composite")>()), runCarouselTextComposition: async (input: { base: Buffer }) => ({ buffer: input.base }),
}));
vi.mock("@/server/application/ensure-creative-work-output-library", () => ({ ensureCreativeWorkOutputInLibrary: vi.fn() }));
vi.mock("@/server/jobs/client", () => ({ inngest: { createFunction: (_config: unknown, fn: unknown) => ({ fn }), send: provider.send } }));
vi.mock("@/server/beta-analytics/record", () => ({ recordBetaAnalyticsEvent: vi.fn(async () => undefined) }));
vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({ isE2EControlledProviderEnabled: () => false }));

import { db } from "@/server/db";
import { brandKnowledgeVersions, brandTrainingSessions, calibrationRules, clientProfiles, creativeWorkItems, creativeWorkOutputs, user, workspaces } from "@/server/db/schema";
import { startBrandCalibration } from "@/server/application/calibrate-brand-training";
import { reviseCalibrationExample, reviseCreativeWorkOutput } from "@/server/application/revise-creative-work-output";
import { pinGuidanceSelection, revertGuidanceSelection } from "@/server/brand-taste/guidance-selection";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
import { loadLocalLearningPromptCalibrationContext } from "@/server/brand-taste/prompt-calibration-loader";
import { CALIBRATION_FORMAT, CALIBRATION_REVISION_INSTRUCTION, calibrationCredits, freezeCandidate, type Candidate } from "@/server/brand-training/calibration";
import { captureCalibrationGuidance } from "@/server/brand-training/visual-guidance";
import { runCreativeWorkCarouselSlide } from "@/server/jobs/creative-work-carousel";
import { creativeWorkOutputJob } from "@/server/jobs/creative-work";
import { publishBrandKnowledgeVersion } from "@/server/repositories/brand-knowledge";
import { appendCalibrationRound, createTrainingSession, getTrainingSessionById, mutateTrainingSession, type CalibrationWorkDraft } from "@/server/repositories/brand-training-sessions";
import { getGuidanceSelection } from "@/server/repositories/guidance-selection";
import { calibrationProofPending, calibrationRefinementDue, loadCalibrationExampleEvidence } from "@/server/repositories/calibration-scope-evidence";
import { getCreativeWorkPromptVersion } from "@/server/shared-skills";
import type { GenerationRequest } from "@/server/generation/canonical/types";
import type { ExecuteCanonicalGenerationOptions } from "@/server/generation/pipeline/execute";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Calibration refinement tests require matching local test database URLs ending in _test");
  }
}
const workspaceId = randomUUID(), clientProfileId = randomUUID(), userId = randomUUID();
const email = `${userId}@example.test`;
const own = { workspaceId, clientProfileId };
const refinementVersion = () => getCreativeWorkPromptVersion("refinement");
const ALL_MODES = ["single", "creative_revision", "format_adaptation"];
const CAROUSEL_MODES = [...ALL_MODES, "carousel"];

afterEach(async () => {
  provider.image.mockReset(); provider.create.mockReset(); provider.copy.mockReset();
  provider.spend.mockClear(); provider.send.mockClear();
  vi.unstubAllEnvs();
  if (!testUrl) return;
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(user).where(eq(user.id, userId));
});

function controlledProviders() {
  provider.copy.mockResolvedValue({ headline: "Marca em teste", body: "Texto de teste de calibração", cta: "Conheça" });
  provider.create.mockResolvedValue({ choices: [{ message: { content: '{"brief":"Composição editorial sóbria."}' } }] });
  provider.image.mockImplementation(async (request: GenerationRequest, options: ExecuteCanonicalGenerationOptions) => {
    await options.onProviderRequest?.(request.prompt.text);
    return { outputKey: `controlled/${request.destination.id}.png`, candidates: [], imageOperation: "edit", providerCalls: 1 };
  });
}
const insertRule = async (text: string, generationModes: string[] = ALL_MODES) => (await db.insert(calibrationRules).values({ ...own,
  category: "hierarchy", status: "approved", rationale: text,
  confirmedMetadata: { category: "hierarchy", nature: "visual", roles: ["art_direction", "image_prompt"], generationModes,
    formats: ["4:5", "9:16", "1:1"], contentHash: hashGuidanceContent(text) },
  metadataConfirmedBy: userId, metadataConfirmedAt: new Date(),
}).returning())[0];

async function freeze(): Promise<Candidate> {
  const visualGuidance = await captureCalibrationGuidance(own);
  return freezeCandidate({ schemaVersion: 2, visualGuidance,
    knowledge: { schemaVersion: 1, profileId: clientProfileId, compiledAt: "2026-10-30T12:00:00.000Z", claims: [], excluded: [] },
    identity: { clientProfileId, confirmedAt: "2026-10-30T12:00:00.000Z", assets: [], brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null } }, evidenceHashes: {},
  });
}
async function fixture(generationModes: string[] = ALL_MODES) {
  controlledProviders();
  await db.insert(user).values({ id: userId, name: "Operador", email });
  await db.insert(workspaces).values({ id: workspaceId, name: "Refinamento", slug: workspaceId });
  await db.insert(clientProfiles).values({ id: clientProfileId, workspaceId, name: "Refinamento" });
  const rule = await insertRule("Preserve o respiro ao redor do foco.", generationModes);
  const candidate = await freeze();
  const session = await createTrainingSession({ workspaceId, profileId: clientProfileId, userId, candidate, baseVersionId: null });
  return { rule, candidate, sessionId: session.id };
}
const load = async (sessionId: string) => (await getTrainingSessionById(workspaceId, clientProfileId, sessionId))!;
const start = async (sessionId: string) => startBrandCalibration({ workspaceId, profileId: clientProfileId, sessionId, userId,
  expectedRevision: (await load(sessionId)).revision, acceptedCredits: calibrationCredits(CALIBRATION_FORMAT) });
const evidenceOf = async (sessionId: string) => {
  const session = await load(sessionId);
  return { session, evidence: await loadCalibrationExampleEvidence({ workspaceId, sessionId, rounds: session.rounds, candidateHash: session.candidate.hash }) };
};
const memoized = () => {
  const memo = new Map<string, unknown>();
  return { run: async (name: string, fn: () => Promise<unknown>) => {
    if (memo.has(name)) return memo.get(name);
    const value = JSON.parse(JSON.stringify(await fn()) ?? "null");
    memo.set(name, value);
    return value;
  } };
};
const runOutput = (workItemId: string, outputId: string, step = memoized()) => (creativeWorkOutputJob as unknown as { fn: (args: unknown) => Promise<unknown> })
  .fn({ event: { data: { workspaceId, workItemId, outputId } }, step });
async function rate(sessionId: string, round: number, slot: number, rating: "good" | "bad") {
  await mutateTrainingSession({ workspaceId, profileId: clientProfileId, sessionId, expectedRevision: (await load(sessionId)).revision,
    command: { type: "feedback", round, slot, rating, note: "", dimensions: [], actorId: userId } });
}
async function runCover(work: typeof creativeWorkItems.$inferSelect, slideId: string) {
  const buffer = await sharp({ create: { width: 1024, height: work.format === "4:5" ? 1280 : 1024, channels: 3, background: "#dddddd" } }).png().toBuffer();
  provider.image.mockImplementationOnce(async (request: GenerationRequest, options: ExecuteCanonicalGenerationOptions) => {
    await options.onProviderRequest?.(request.prompt.text);
    return { outputKey: `simulated/${request.destination.id}.png`, buffer, candidates: [], providerCalls: 1 };
  });
  expect(await runCreativeWorkCarouselSlide({ event: { workspaceId, workItemId: work.id, slideId } })).toMatchObject({ success: true });
}
/** Runs the queued jobs of a round, then records the operator's judgement of each example. */
async function settle(sessionId: string, number: number, ratings: readonly ("good" | "bad")[] = ["good", "good", "good", "good"]) {
  const round = (await load(sessionId)).rounds.find(entry => entry.number === number)!;
  const works = await allWorks();
  for (const slot of round.slots) {
    expect(slot.outputId).toBeTruthy();
    const work = works.find(entry => entry.id === slot.workItemId)!;
    if (work.toolKind === "carousel") await runCover(work, slot.outputId!);
    else expect(await runOutput(slot.workItemId, slot.outputId!)).toMatchObject({ success: true });
    await rate(sessionId, number, slot.index, ratings[slot.index]!);
  }
  return (await load(sessionId)).rounds.find(entry => entry.number === number)!;
}
const scopeOf = (entry: { generationMode: string; format: string }) => `${entry.generationMode} ${entry.format}`;
const roundScopes = async (sessionId: string, number: number) => (await evidenceOf(sessionId)).evidence.filter(example => example.round === number).map(scopeOf);
const outputRow = async (id: string) => (await db.select().from(creativeWorkOutputs).where(eq(creativeWorkOutputs.id, id)))[0]!;
const allWorks = () => db.select().from(creativeWorkItems).where(eq(creativeWorkItems.workspaceId, workspaceId));
const publish = async (sessionId: string, candidateHash: string) => publishBrandKnowledgeVersion({ workspaceId, clientProfileId, userId, sessionId,
  expectedRevision: (await load(sessionId)).revision, candidateHash });
const refinementContext = (patch: Partial<Parameters<typeof loadLocalLearningPromptCalibrationContext>[0]> = {}) => loadLocalLearningPromptCalibrationContext({
  ...own, role: "art_direction", generationMode: "creative_revision", format: "4:5", language: "pt-BR", fixedPromptVersion: refinementVersion(), ...patch,
});
const publishedScopes = (snapshot: unknown) => (snapshot as { visualGuidance: { sets: { role: string; generationMode: string; format: string }[] } }).visualGuidance.sets
  .filter(set => set.role === "art_direction").map(scopeOf);

describe.skipIf(!testUrl)("Refinement calibration scopes (Postgres, controlled providers)", () => {
  it("proves revision and adaptation from an approved Peça-base through publication, keeping the exact scope", async () => {
    const { rule, candidate, sessionId } = await fixture();
    const scopes = candidate.visualGuidance!.sets.filter(set => set.generationMode !== "single");
    expect(scopes.map(set => [set.role, set.generationMode, set.format, set.language, set.fixedPromptVersion])).toEqual([
      ["art_direction", "creative_revision", "4:5", "pt-BR", refinementVersion()],
      ["art_direction", "creative_revision", "9:16", "pt-BR", refinementVersion()],
      ["art_direction", "format_adaptation", "9:16", "pt-BR", refinementVersion()],
    ]);

    const first = await start(sessionId);
    expect(await roundScopes(sessionId, 1)).toEqual(["single 4:5", "single 9:16", "single 4:5", "single 4:5"]);
    const waiting = await evidenceOf(sessionId);
    expect(calibrationProofPending(candidate.visualGuidance, waiting.evidence).map(entry => entry.reason)).toEqual(["no_base", "no_base", "no_base"]);
    const unratedFirst = (await load(sessionId)).rounds[0]!;
    const [baseOutputId, storyOutputId] = [unratedFirst.slots[0].outputId!, unratedFirst.slots[1].outputId!];
    await settle(sessionId, 1);
    const judged = await evidenceOf(sessionId);
    expect(calibrationProofPending(candidate.visualGuidance, judged.evidence).map(entry => [scopeOf(entry), entry.reason])).toEqual([
      ["creative_revision 4:5", "awaiting_round"], ["creative_revision 9:16", "awaiting_round"], ["format_adaptation 9:16", "awaiting_round"],
    ]);
    expect(calibrationRefinementDue(candidate.visualGuidance, judged.evidence)).toBe(true);

    const [{ copy, brief, identitySnapshot }] = await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, first.workItemIds[0]));
    const baseBefore = { copy, brief, identitySnapshot };
    provider.copy.mockClear();
    const second = await start(sessionId);
    expect(await roundScopes(sessionId, 2)).toEqual(["single 4:5", "creative_revision 4:5", "single 9:16", "format_adaptation 9:16"]);
    expect(await allWorks()).toHaveLength(6);
    expect(provider.copy).toHaveBeenCalledTimes(2);
    expect(second.workItemIds[1]).toBe(first.workItemIds[0]);
    expect(second.workItemIds[3]).toBe(first.workItemIds[0]);
    const round = (await load(sessionId)).rounds[1]!;
    expect(round.slots[1].refinement).toEqual({ generationMode: "creative_revision", format: "4:5", baseRound: 1, baseSlot: 0, baseOutputId });
    expect(round.slots[3].refinement).toEqual({ generationMode: "format_adaptation", format: "9:16", baseRound: 1, baseSlot: 0, baseOutputId });
    expect(storyOutputId).not.toBe(baseOutputId);

    const revision = await outputRow(round.slots[1].outputId!), adaptation = await outputRow(round.slots[3].outputId!);
    expect(revision).toMatchObject({ parentOutputId: baseOutputId, targetFormat: "4:5" });
    expect(revision.revisionInstruction).toContain(CALIBRATION_REVISION_INSTRUCTION);
    expect(revision.revisionContext).toMatchObject({ action: "refine", sourceOutputId: baseOutputId, instruction: CALIBRATION_REVISION_INSTRUCTION, annotations: [] });
    expect(adaptation).toMatchObject({ parentOutputId: baseOutputId, targetFormat: "9:16" });
    expect(adaptation.revisionContext).toMatchObject({ action: "format", targetFormat: "9:16", instruction: "" });
    for (const [row, generationMode, format] of [[revision, "creative_revision", "4:5"], [adaptation, "format_adaptation", "9:16"]] as const) {
      expect(row.frozenGuidance).toMatchObject({ generationMode, format, fixedPromptVersion: refinementVersion() });
      expect(row.frozenGuidance!.roles.art_direction.appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
      expect(row.frozenGuidance!.roles.art_direction.lines.join("\n")).toContain(rule.rationale);
      expect(row.frozenGuidance!.roles.image_prompt).toMatchObject({ lines: [], appliedRefs: [] });
      expect(row.frozenGuidance!.roles.copy).toMatchObject({ lines: [], appliedRefs: [] });
    }

    // The fixed request reaches the image call and the proved lines reach the art direction model.
    const spentBefore = provider.spend.mock.calls.length;
    provider.create.mockClear(); provider.image.mockClear();
    expect(await runOutput(second.workItemIds[1], revision.id)).toMatchObject({ success: true });
    expect(JSON.stringify(provider.create.mock.calls[0]![0].messages)).toContain(rule.rationale);
    const imagePrompt = (provider.image.mock.lastCall![0] as GenerationRequest).prompt.text;
    expect(imagePrompt).toContain(CALIBRATION_REVISION_INSTRUCTION);
    expect(imagePrompt).toContain(revision.frozenGuidance!.roles.art_direction.lines.join("\n"));
    // Nothing besides the fixed request changes: the base's copy, brief and identity stay as approved.
    const [baseWork] = await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, second.workItemIds[1]));
    expect({ copy: baseWork.copy, brief: baseWork.brief, identitySnapshot: baseWork.identitySnapshot }).toEqual(baseBefore);

    const scope = { workspaceId, workItemId: second.workItemIds[1], userId, sessionId, round: 2, slot: 1 as const, refinement: round.slots[1].refinement! };
    expect(await reviseCalibrationExample(scope)).toMatchObject({ ok: true, value: { output: { id: revision.id } } });
    expect(provider.spend.mock.calls.length).toBe(spentBefore);

    expect(await runOutput(second.workItemIds[1], revision.id)).toMatchObject({ success: true, skipped: true });
    await settle(sessionId, 2);
    const proved = await evidenceOf(sessionId);
    expect(proved.evidence.filter(example => example.refinement).every(example => example.approved)).toBe(true);
    expect(calibrationProofPending(candidate.visualGuidance, proved.evidence).map(scopeOf)).toEqual(["creative_revision 9:16"]);

    const published = await publish(sessionId, candidate.hash);
    expect(publishedScopes(published.snapshot)).toEqual(expect.arrayContaining(["creative_revision 4:5", "format_adaptation 9:16"]));
    expect(publishedScopes(published.snapshot)).not.toContain("creative_revision 9:16");
    expect((await refinementContext()).appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
    expect((await refinementContext({ generationMode: "format_adaptation", format: "9:16" })).appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
    for (const patch of [
      { format: "9:16" }, { format: "1:1" }, { language: "en" as const }, { fixedPromptVersion: "changed/v1" },
      { generationMode: "format_adaptation" }, { generationMode: "single" }, { role: "image_prompt" as const },
    ]) {
      expect((await refinementContext(patch)).lines, JSON.stringify(patch)).toEqual([]);
    }
  });

  it("moves the revision to the unproved format and keeps four images and three rounds", async () => {
    const { sessionId } = await fixture();
    await start(sessionId); await settle(sessionId, 1);
    await start(sessionId); await settle(sessionId, 2);
    const third = await start(sessionId);
    expect(await roundScopes(sessionId, 3)).toEqual(["single 4:5", "creative_revision 9:16", "single 9:16", "single 4:5"]);
    const session = await load(sessionId);
    const storyBase = session.rounds[1]!.slots[2];
    expect(session.rounds[2]!.slots[1].refinement).toMatchObject({ format: "9:16", baseRound: 2, baseSlot: 2, baseOutputId: storyBase.outputId });
    expect(third.workItemIds[1]).toBe(storyBase.workItemId);
    expect(session.rounds.every(round => round.slots.length === 4 && round.quoteCredits === calibrationCredits(CALIBRATION_FORMAT))).toBe(true);
    expect(await allWorks()).toHaveLength(9);
    expect(provider.spend).toHaveBeenCalledTimes(12);
    await settle(sessionId, 3);
    await expect(start(sessionId)).rejects.toMatchObject({ code: "round_limit" });
    expect(await allWorks()).toHaveLength(9);
    expect((await load(sessionId)).rounds).toHaveLength(3);
  });

  it("only refines an approved base and drops the proof when that base loses its approval", async () => {
    const { rule, candidate, sessionId } = await fixture();
    await start(sessionId);
    await settle(sessionId, 1, ["bad", "good", "bad", "bad"]);
    const { evidence } = await evidenceOf(sessionId);
    expect(calibrationProofPending(candidate.visualGuidance, evidence).map(entry => [scopeOf(entry), entry.reason])).toEqual([
      ["creative_revision 4:5", "no_base"], ["creative_revision 9:16", "awaiting_round"], ["format_adaptation 9:16", "no_base"],
    ]);
    await start(sessionId);
    expect(await roundScopes(sessionId, 2)).toEqual(["single 4:5", "creative_revision 9:16", "single 9:16", "single 4:5"]);
    await settle(sessionId, 2);
    await start(sessionId);
    expect(await roundScopes(sessionId, 3)).toEqual(["single 4:5", "creative_revision 4:5", "single 9:16", "format_adaptation 9:16"]);
    await settle(sessionId, 3);
    await rate(sessionId, 2, 0, "bad");
    const published = await publish(sessionId, candidate.hash);
    expect(publishedScopes(published.snapshot)).toEqual(expect.arrayContaining(["single 4:5", "single 9:16", "creative_revision 9:16"]));
    expect(publishedScopes(published.snapshot)).not.toContain("creative_revision 4:5");
    expect(publishedScopes(published.snapshot)).not.toContain("format_adaptation 9:16");
    expect((await refinementContext()).lines).toEqual([]);
    expect((await refinementContext({ format: "9:16" })).appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
  });

  it("does not reuse a Peça-base of a replaced candidate", async () => {
    const { sessionId } = await fixture();
    await start(sessionId); await settle(sessionId, 1);
    await insertRule("Agrupe os elementos secundários.");
    const replaced = await freeze();
    await db.update(brandTrainingSessions).set({ status: "review" }).where(eq(brandTrainingSessions.id, sessionId));
    await mutateTrainingSession({ workspaceId, profileId: clientProfileId, sessionId, expectedRevision: (await load(sessionId)).revision,
      command: { type: "replace_candidate", candidate: replaced } });
    const { session, evidence } = await evidenceOf(sessionId);
    expect(evidence).toEqual([]);
    expect(calibrationProofPending(session.candidate.visualGuidance, evidence).map(entry => entry.reason)).toEqual(["no_base", "no_base", "no_base"]);
    await start(sessionId);
    expect(await roundScopes(sessionId, 2)).toEqual(["single 4:5", "single 9:16", "single 4:5", "single 4:5"]);
    expect((await load(sessionId)).rounds[1]!.slots.some(slot => slot.refinement)).toBe(false);
  });

  it("conserves the proved selection for a newer rule without crossing pin, reversal or retirement", async () => {
    vi.stubEnv("PLATFORM_OWNER_EMAILS", email);
    const { rule, candidate, sessionId } = await fixture();
    await start(sessionId); await settle(sessionId, 1);
    await start(sessionId); await settle(sessionId, 2);
    await publish(sessionId, candidate.hash);
    const previous = await getGuidanceSelection(own);
    const newer = await insertRule("Orientação nova ainda sem prova.");
    const unproved = await refinementContext();
    expect(unproved.appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
    expect(unproved.omissions).toContainEqual({ ruleId: newer.id, reason: "visual_proof_missing" });
    const latest = await getGuidanceSelection(own);
    const reviewer = { ...own, reviewerUserId: userId };
    const onlyNewer = latest.refs.filter(ref => ref.ruleId === newer.id);
    const pinned = await pinGuidanceSelection({ ...reviewer, expectedVersion: latest.version, refs: onlyNewer });
    expect((await refinementContext()).lines).toEqual([]);
    const restored = await revertGuidanceSelection({ ...reviewer, expectedVersion: pinned.version });
    expect(restored.refs.map(ref => ref.ruleId).sort()).toEqual([rule.id, newer.id].sort());
    expect((await refinementContext()).appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
    const repinned = await pinGuidanceSelection({ ...reviewer, expectedVersion: restored.version, refs: onlyNewer });
    const kept = await pinGuidanceSelection({ ...reviewer, expectedVersion: repinned.version, refs: previous.refs });
    expect((await refinementContext()).appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
    const reverted = await revertGuidanceSelection({ ...reviewer, expectedVersion: kept.version });
    expect(reverted.refs).toEqual(onlyNewer);
    expect((await refinementContext()).lines).toEqual([]);
    await revertGuidanceSelection({ ...reviewer, expectedVersion: reverted.version });
    expect((await refinementContext()).appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
    await db.update(calibrationRules).set({ status: "deprecated" }).where(eq(calibrationRules.id, rule.id));
    expect((await refinementContext()).lines).toEqual([]);
  });

  it("adds no refinement scope or example without an eligible visual rule", async () => {
    const { candidate, sessionId } = await fixture(["single"]);
    expect(candidate.visualGuidance!.sets.every(set => set.generationMode === "single")).toBe(true);
    await start(sessionId); await settle(sessionId, 1);
    const { evidence } = await evidenceOf(sessionId);
    expect(calibrationProofPending(candidate.visualGuidance, evidence)).toEqual([]);
    expect(calibrationRefinementDue(candidate.visualGuidance, evidence)).toBe(false);
    await start(sessionId);
    expect(await roundScopes(sessionId, 2)).toEqual(["single 4:5", "single 9:16", "single 4:5", "single 4:5"]);
    expect((await load(sessionId)).rounds[1]!.slots.some(slot => slot.refinement)).toBe(false);
  });

  it("keeps calibration examples away from the operator revision and resumes a stored round", async () => {
    const { sessionId } = await fixture();
    await start(sessionId); await settle(sessionId, 1);
    const second = await start(sessionId);
    const session = await load(sessionId);
    const worksBefore = await allWorks();
    const workItemId = second.workItemIds[0];
    expect(await reviseCreativeWorkOutput({ workspaceId, workItemId: session.rounds[0]!.slots[0].workItemId, outputId: session.rounds[0]!.slots[0].outputId!, userId, instruction: "Troque o título" }))
      .toEqual({ ok: false, error: { code: "calibration_managed" } });
    const resumed = await appendCalibrationRound({ workspaceId, profileId: clientProfileId, sessionId, expectedRevision: session.revision, roundNumber: 2,
      candidate: session.candidate, quoteCredits: 8, coverage: [], confirmedBy: userId,
      works: [0, 1, 2, 3].map(index => ({ id: randomUUID(), draftKey: `${sessionId}:replay:${index}`, title: "Calibração", request: "Reexecução" })) as [CalibrationWorkDraft, CalibrationWorkDraft, CalibrationWorkDraft, CalibrationWorkDraft] });
    expect(resumed).toMatchObject({ resumed: true, workItemIds: second.workItemIds });
    expect(await allWorks()).toHaveLength(worksBefore.length);
    expect(workItemId).toBe(session.rounds[1]!.slots[0].workItemId);
  });

  it("lets the priority displace an approved carousel, whose round 1 proof still publishes", async () => {
    const { rule, candidate, sessionId } = await fixture(CAROUSEL_MODES);
    await start(sessionId);
    expect(await roundScopes(sessionId, 1)).toEqual(["single 4:5", "single 9:16", "carousel 4:5", "carousel 1:1"]);
    await settle(sessionId, 1);
    await start(sessionId);
    expect(await roundScopes(sessionId, 2)).toEqual(["single 4:5", "creative_revision 4:5", "single 9:16", "format_adaptation 9:16"]);
    await settle(sessionId, 2);
    const published = await publish(sessionId, candidate.hash);
    expect(publishedScopes(published.snapshot)).toEqual(expect.arrayContaining(["creative_revision 4:5", "format_adaptation 9:16"]));
    expect((await loadLocalLearningPromptCalibrationContext({ ...own, role: "image_prompt", generationMode: "carousel", format: "4:5", language: "en", fixedPromptVersion: getCreativeWorkPromptVersion("image_prompt") }))
      .appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
    expect(await db.select().from(brandKnowledgeVersions).where(eq(brandKnowledgeVersions.clientProfileId, clientProfileId))).toHaveLength(1);
  });

  it("keeps a proved refinement out of later rounds, so nothing revokes its proof", async () => {
    const { candidate, sessionId } = await fixture();
    await start(sessionId); await settle(sessionId, 1);
    await start(sessionId); await settle(sessionId, 2);
    const proved = await evidenceOf(sessionId);
    expect(calibrationRefinementDue(candidate.visualGuidance, proved.evidence)).toBe(true);
    await start(sessionId);
    const scopes = await roundScopes(sessionId, 3);
    expect(scopes).not.toContain("creative_revision 4:5");
    expect(scopes).not.toContain("format_adaptation 9:16");
    await settle(sessionId, 3);
    const final = await evidenceOf(sessionId);
    expect(calibrationProofPending(candidate.visualGuidance, final.evidence)).toEqual([]);
    expect(calibrationRefinementDue(candidate.visualGuidance, final.evidence)).toBe(false);
    expect(publishedScopes((await publish(sessionId, candidate.hash)).snapshot))
      .toEqual(expect.arrayContaining(["creative_revision 4:5", "creative_revision 9:16", "format_adaptation 9:16"]));
  });

  it("publishes a later full proof of the same candidate as a new version", async () => {
    const { candidate, sessionId } = await fixture();
    await start(sessionId); await settle(sessionId, 1);
    await start(sessionId); await settle(sessionId, 2);
    const partial = await publish(sessionId, candidate.hash);
    expect(publishedScopes(partial.snapshot)).not.toContain("creative_revision 9:16");
    expect(partial.hash).not.toBe(candidate.hash);

    const next = await createTrainingSession({ workspaceId, profileId: clientProfileId, userId, candidate, baseVersionId: partial.id });
    for (const round of [1, 2, 3]) { await start(next.id); await settle(next.id, round); }
    const full = await publish(next.id, candidate.hash);
    expect(full.id).not.toBe(partial.id);
    expect(full.hash).toBe(candidate.hash);
    expect(publishedScopes(full.snapshot)).toContain("creative_revision 9:16");
    expect(full.status).toBe("active");
  });

  it("keeps one version when the selection kept for an unproved scope is what the candidate holds", async () => {
    const { candidate, sessionId } = await fixture();
    for (const round of [1, 2, 3]) { await start(sessionId); await settle(sessionId, round); }
    const full = await publish(sessionId, candidate.hash);
    expect(full.hash).toBe(candidate.hash);

    const next = await createTrainingSession({ workspaceId, profileId: clientProfileId, userId, candidate, baseVersionId: full.id });
    await start(next.id); await settle(next.id, 1, ["good", "good", "bad", "good"]);
    await start(next.id); await settle(next.id, 2);
    const again = await publish(next.id, candidate.hash);
    expect(again.id).toBe(full.id);
    expect(await db.select().from(brandKnowledgeVersions).where(eq(brandKnowledgeVersions.workspaceId, workspaceId))).toHaveLength(1);
  });

  it("puts a returning candidate live again instead of only marking its session activated", async () => {
    const { candidate, sessionId } = await fixture();
    for (const round of [1, 2, 3]) { await start(sessionId); await settle(sessionId, round); }
    const first = await publish(sessionId, candidate.hash);

    await insertRule("Agrupe os elementos secundários.");
    const other = await freeze();
    const between = await createTrainingSession({ workspaceId, profileId: clientProfileId, userId, candidate: other, baseVersionId: first.id });
    for (const round of [1, 2, 3]) { await start(between.id); await settle(between.id, round); }
    const second = await publish(between.id, other.hash);
    expect(second.id).not.toBe(first.id);

    const back = await createTrainingSession({ workspaceId, profileId: clientProfileId, userId, candidate, baseVersionId: second.id });
    for (const round of [1, 2, 3]) { await start(back.id); await settle(back.id, round); }
    const again = await publish(back.id, candidate.hash);
    expect(again).toMatchObject({ id: first.id, status: "active" });
    expect((await db.select().from(brandKnowledgeVersions).where(eq(brandKnowledgeVersions.workspaceId, workspaceId))).map(version => [version.id, version.status]))
      .toEqual(expect.arrayContaining([[first.id, "active"], [second.id, "superseded"]]));
  });

  it("warns about a rejected carousel pushed out of the round and proves it once a slot frees", async () => {
    const { candidate, sessionId } = await fixture(CAROUSEL_MODES);
    await start(sessionId); await settle(sessionId, 1, ["good", "good", "bad", "good"]);
    await start(sessionId);
    expect(await roundScopes(sessionId, 2)).toEqual(["single 4:5", "creative_revision 4:5", "single 9:16", "format_adaptation 9:16"]);
    await settle(sessionId, 2);
    const displaced = await evidenceOf(sessionId);
    expect(calibrationProofPending(candidate.visualGuidance, displaced.evidence).map(entry => [scopeOf(entry), entry.reason])).toContainEqual(["carousel 4:5", "not_approved"]);
    expect(calibrationRefinementDue(candidate.visualGuidance, displaced.evidence)).toBe(true);
    await start(sessionId);
    expect(await roundScopes(sessionId, 3)).toEqual(["single 4:5", "creative_revision 9:16", "single 9:16", "carousel 4:5"]);
    await settle(sessionId, 3);
    const final = await evidenceOf(sessionId);
    expect(calibrationProofPending(candidate.visualGuidance, final.evidence).map(scopeOf)).not.toContain("carousel 4:5");
    expect(publishedScopes((await publish(sessionId, candidate.hash)).snapshot)).toEqual(expect.arrayContaining(["creative_revision 9:16"]));
  });

  it("offers one more round for a displaced carousel once every refinement is proved", async () => {
    const { candidate, sessionId } = await fixture(["single", "format_adaptation", "carousel"]);
    await start(sessionId); await settle(sessionId, 1, ["good", "good", "good", "bad"]);
    await start(sessionId);
    expect(await roundScopes(sessionId, 2)).toEqual(["single 4:5", "single 9:16", "format_adaptation 9:16", "carousel 4:5"]);
    await settle(sessionId, 2);
    const displaced = await evidenceOf(sessionId);
    expect(calibrationProofPending(candidate.visualGuidance, displaced.evidence).map(scopeOf)).toEqual(["carousel 1:1"]);
    expect(calibrationRefinementDue(candidate.visualGuidance, displaced.evidence)).toBe(true);
    await start(sessionId);
    expect(await roundScopes(sessionId, 3)).toEqual(["single 4:5", "single 9:16", "carousel 4:5", "carousel 1:1"]);
  });

  it("does not publish a rejected carousel the later rounds never reached", async () => {
    const { rule, candidate, sessionId } = await fixture(CAROUSEL_MODES);
    await start(sessionId); await settle(sessionId, 1, ["good", "good", "bad", "good"]);
    await start(sessionId); await settle(sessionId, 2);
    const published = await publish(sessionId, candidate.hash);
    expect(published.hash).not.toBe(candidate.hash);
    const carousel = (format: "4:5" | "1:1") => loadLocalLearningPromptCalibrationContext({ ...own, role: "image_prompt", generationMode: "carousel", format, language: "en", fixedPromptVersion: getCreativeWorkPromptVersion("image_prompt") });
    expect((await carousel("4:5")).appliedRefs).toEqual([]);
    expect((await carousel("1:1")).appliedRefs.map(ref => ref.ruleId)).toEqual([rule.id]);
  });
});
