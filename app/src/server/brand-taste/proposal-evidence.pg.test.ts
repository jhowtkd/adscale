import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import {
  user, workspaces, clientProfiles, campaigns, derivations, humanQualityCorpusItems,
  humanQualityEvaluations, humanQualityFeedbackArtifacts, creativeWorkItems,
  creativeWorkOutputs, calibrationSignals, outputDecisionEvents, calibrationRules, clientLearningProposals,
} from "../db/schema";
import { equipeAccounts, equipeFronts, equipeItems, equipeItemVersions, equipeEvents } from "../db/equipe-schema";
import { resolveEquipeTestDatabaseUrl } from "../equipe/data/test-database";
import { loadProposalEvidence, getProposalEvidencePieceKey } from "./proposal-evidence";
import { acceptClientLearningProposal } from "../human-quality/learning/proposals";
import type { ProposalEvidenceRef } from "./proposal-evidence-types";

const testUrl = resolveEquipeTestDatabaseUrl();
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test") || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Evidence tests require matching local test database URLs ending in _test");
  }
}
const actorId = randomUUID();
const workspaceIds: string[] = [];

async function seed(workspaceId?: string) {
  if (!workspaceId) {
    const [workspace] = await db.insert(workspaces).values({ name: "Evidência simulada", slug: randomUUID() }).returning();
    workspaceId = workspace.id; workspaceIds.push(workspaceId);
  }
  const [brand] = await db.insert(clientProfiles).values({ workspaceId, name: "Marca simulada" }).returning();
  const scope = { workspaceId, clientProfileId: brand.id };
  const [campaign] = await db.insert(campaigns).values({ ...scope, name: "Campanha simulada" }).returning();
  const corpus = [];
  for (let index = 0; index < 3; index++) {
    const [derivation] = await db.insert(derivations).values({ workspaceId, campaignId: campaign.id, outputKey: `test/688/${randomUUID()}.png`, status: "completed" }).returning();
    const [item] = await db.insert(humanQualityCorpusItems).values({ ...scope, campaignId: campaign.id, derivationId: derivation.id, generationMode: "art_variation", status: "evaluated" }).returning();
    const [evaluation] = await db.insert(humanQualityEvaluations).values({ workspaceId, corpusItemId: item.id, reviewerUserId: actorId, visualScore: 42, factualPass: true, intent: "regenerate", primaryFailureReason: "weak_hierarchy", notes: "A hierarquia precisa melhorar." }).returning();
    const [artifact] = await db.insert(humanQualityFeedbackArtifacts).values({ ...scope,
      corpusItemId: item.id, evaluationId: evaluation.id, derivationId: derivation.id, campaignId: campaign.id,
      sourceLabel: "synthetic_fixture", cohort: "baseline", generationMode: "art_variation", payload: {
        schemaVersion: 1, evaluation: { visualScore: 42, factualPass: true, intent: "regenerate", primaryFailureReason: "weak_hierarchy" },
        corpusContext: { cohort: "baseline", generationMode: "art_variation", format: "4:5", corpusVersion: 1 }, improvementTargets: ["hierarchy"],
      },
    }).returning();
    corpus.push({ item, evaluation, artifact });
  }
  const [work] = await db.insert(creativeWorkItems).values({ ...scope, createdByUserId: actorId, title: "Trabalho", request: "Teste", toolKind: "single", settings: { targetFormats: ["4:5"] }, brief: { theme: "Tema", objective: "Objetivo", audience: "Público", offer: "Oferta" } }).returning();
  const [output] = await db.insert(creativeWorkOutputs).values({ workspaceId, workItemId: work.id, creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1, operationKey: randomUUID(), outputKey: `test/688/${randomUUID()}.png`, status: "completed" }).returning();
  const [decision] = await db.insert(outputDecisionEvents).values({ ...scope, userId: actorId, creativeWorkOutputId: output.id, action: "regenerated", direction: "corrective", strength: "strong", source: "operator" }).returning();
  const [signal] = await db.insert(calibrationSignals).values({ ...scope, creativeWorkOutputId: output.id, outputDecisionEventId: decision.id, humanVerdict: "quase", sourceLabel: "synthetic_fixture", reviewerId: actorId, reviewedAt: new Date() }).returning();
  const [account] = await db.insert(equipeAccounts).values(scope).returning();
  const [front] = await db.insert(equipeFronts).values({ workspaceId, accountId: account.id, key: "social_instagram" }).returning();
  const [equipeItem] = await db.insert(equipeItems).values({ workspaceId, accountId: account.id, frontId: front.id }).returning();
  const [version] = await db.insert(equipeItemVersions).values({ workspaceId, accountId: account.id, itemId: equipeItem.id, versionHash: "a".repeat(64), creativeWorkOutputId: output.id, caption: "Legenda da Versão decidida", authorRole: "copy" }).returning();
  const [event] = await db.insert(equipeEvents).values({ workspaceId, accountId: account.id, actorType: "client_person", eventType: "item.adjusted", objectType: "item", objectId: equipeItem.id, payload: { versionHash: version.versionHash, prompt: "PRIVATE_PROMPT", signedUrl: "https://private.invalid/SECRET_SIGNATURE" } }).returning();
  const refs: ProposalEvidenceRef[] = [
    { kind: "corpus_item", id: corpus[0].item.id }, { kind: "corpus_evaluation", id: corpus[0].evaluation.id },
    { kind: "feedback_artifact", id: corpus[0].artifact.id }, { kind: "calibration_signal", id: signal.id },
    { kind: "output_decision", id: decision.id }, { kind: "equipe_event", id: event.id }, { kind: "equipe_item_version", id: version.id },
  ];
  return { scope, corpus, refs, output, signal, account, equipeItem, version };
}

type Fixture = Awaited<ReturnType<typeof seed>>;
async function rule(fixture: Fixture, supportingEvidenceRefs: ProposalEvidenceRef[] = fixture.refs, supportingSignalIds: string[] = []) {
  const [row] = await db.insert(calibrationRules).values({ ...fixture.scope, category: "gestalt", rationale: "Reforçar a hierarquia", supportingEvidenceRefs, supportingSignalIds, caveats: ["Apoio sintético"] }).returning();
  return row;
}
async function report(fixture: Fixture, proposalId: string) {
  return loadProposalEvidence({ ...fixture.scope, proposalKind: "rule", proposalId });
}

describe.skipIf(!testUrl)("typed proposal evidence (Postgres)", () => {
  let own: Fixture; let foreign: Fixture; let otherBrand: Fixture;
  beforeAll(async () => {
    await db.insert(user).values({ id: actorId, name: "Pessoa simulada", email: `${actorId}@example.com` });
    own = await seed(); foreign = await seed(); otherBrand = await seed(own.scope.workspaceId);
  });
  afterAll(async () => {
    if (workspaceIds.length) await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
    await db.delete(user).where(eq(user.id, actorId));
  });

  it("resolves all real types, captured Item versions and pieces without returning prompts or signed URLs", async () => {
    const row = await rule(own);
    const result = await report(own, row.id);
    expect(result?.support).toHaveLength(7);
    expect(result?.counts).toEqual({ independentPieces: 2, independentDecisions: 3,
      unavailableReferences: 0, ungroupedReferences: 0 });
    expect(result?.support.map(ref => ref.kind)).toEqual(own.refs.map(ref => ref.kind));
    expect(result?.support.every(ref => ref.availability === "available")).toBe(true);
    expect(result?.support.find(ref => ref.kind === "equipe_item_version")?.summary).toContain("Legenda da Versão decidida");
    expect(result?.support.find(ref => ref.kind === "output_decision")?.strength).toBe("strong");
    expect(result?.caveats).toEqual(["Apoio sintético"]);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_PROMPT|SECRET_SIGNATURE|outputKey|signedUrl/);
    expect(await getProposalEvidencePieceKey(own.scope, own.refs[3])).toBe(own.output.outputKey);
    expect(result?.support[0].pieceHref).toContain(`proposalId=${row.id}`);
  });

  it("counts a verified Equipe event and its piece projections only once", async () => {
    const [decision] = await db.insert(outputDecisionEvents).values({ ...own.scope, userId: actorId,
      creativeWorkOutputId: own.output.id, equipeEventId: own.refs[5].id,
      action: "regenerated", direction: "corrective", strength: "strong", source: "operator",
    }).returning();
    const [signal] = await db.insert(calibrationSignals).values({ ...own.scope, reviewerId: actorId,
      creativeWorkOutputId: own.output.id, outputDecisionEventId: decision.id,
      humanVerdict: "quase", sourceLabel: "synthetic_fixture", reviewedAt: new Date(),
    }).returning();
    const row = await rule(own, [{ kind: "calibration_signal", id: signal.id }, own.refs[5]]);
    const result = await report(own, row.id);
    expect(result?.support).toHaveLength(4);
    expect(result?.counts).toEqual({ independentPieces: 1, independentDecisions: 1,
      unavailableReferences: 0, ungroupedReferences: 0 });
  });

  it.each(["calibration_signal", "output_decision"] as const)("withholds typed and historical agent %s support and its piece", async (kind) => {
    const [decision] = await db.insert(outputDecisionEvents).values({ ...own.scope, userId: actorId,
      authorType: "agent", actorId: "mcp-agent", actorRole: "strategist", creativeWorkOutputId: own.output.id,
      action: "approved", direction: "positive", strength: "strong", source: "mcp",
      contextSnapshot: { reason: { text: "Decisão exclusiva do agente" } },
    }).returning();
    const [signal] = await db.insert(calibrationSignals).values({ ...own.scope, reviewerId: actorId,
      authorType: "agent", actorId: "mcp-agent", creativeWorkOutputId: own.output.id,
      outputDecisionEventId: decision.id, humanVerdict: "entra", sourceLabel: "real_customer", reviewedAt: new Date(),
    }).returning();
    const ref = { kind, id: kind === "calibration_signal" ? signal.id : decision.id };
    const row = await rule(own, [ref], [ref.id]);
    const result = await report(own, row.id);
    expect(result?.support.every(entry => entry.availability === "unavailable" && entry.summary === null && entry.pieceHref === null)).toBe(true);
    expect(result?.support).toHaveLength(1);
    expect(result?.support[0]?.kind).toBe(kind);
    const historicalRule = await rule(own, [], [ref.id]);
    expect((await report(own, historicalRule.id))?.support).toMatchObject([{ kind, availability: "unavailable", summary: null, pieceHref: null }]);
    expect(JSON.stringify(result)).not.toContain("Decisão exclusiva do agente");
    expect(result?.caveats.join(" ")).toContain("não foi possível conferir");
    expect(await getProposalEvidencePieceKey(own.scope, ref)).toBeNull();
    // A new human signal can reference an operational agent event; that link
    // still must not expose the agent event as human support.
    const [humanSignal] = await db.insert(calibrationSignals).values({ ...own.scope, reviewerId: actorId,
      creativeWorkOutputId: own.output.id, outputDecisionEventId: decision.id,
      humanVerdict: "quase", sourceLabel: "real_customer", reviewedAt: new Date(),
    }).returning();
    const linkedRule = await rule(own, [{ kind: "calibration_signal", id: humanSignal.id }]);
    expect((await report(own, linkedRule.id))?.support).toMatchObject([
      { kind: "calibration_signal", availability: "available" },
      { kind: "output_decision", availability: "unavailable", summary: null, pieceHref: null },
    ]);
  });

  it.each(["human", "equipe_actor"] as const)("keeps %s signals and decisions available with the real piece", async (authorType) => {
    const [sourceEvent] = await db.insert(equipeEvents).values({ workspaceId: own.scope.workspaceId,
      accountId: own.account.id, actorType: "client_person", actorId: "approver-person", actorRole: "approver",
      eventType: "item.approved", objectType: "item", objectId: own.equipeItem.id,
    }).returning();
    const author = authorType === "human" ? { authorType, actorId: null, actorRole: null, equipeEventId: null }
      : { authorType, actorId: sourceEvent.actorId, actorRole: sourceEvent.actorRole, equipeEventId: sourceEvent.id };
    const userId = authorType === "human" ? actorId : null;
    const [decision] = await db.insert(outputDecisionEvents).values({ ...own.scope, ...author, userId,
      creativeWorkOutputId: own.output.id, action: "approved", direction: "positive", strength: "strong", source: "composer",
    }).returning();
    const [signal] = await db.insert(calibrationSignals).values({ ...own.scope, ...author, reviewerId: userId,
      creativeWorkOutputId: own.output.id, outputDecisionEventId: decision.id,
      humanVerdict: "entra", sourceLabel: "real_customer", reviewedAt: new Date(),
    }).returning();
    const refs: ProposalEvidenceRef[] = [{ kind: "calibration_signal", id: signal.id }, { kind: "output_decision", id: decision.id }];
    const row = await rule(own, refs);
    const result = await report(own, row.id);
    expect(result?.support).toHaveLength(authorType === "equipe_actor" ? 3 : 2);
    expect(result?.support.filter(entry => entry.kind !== "equipe_event").every(entry => entry.availability === "available" && entry.pieceHref !== null)).toBe(true);
    expect(result?.counts).toEqual({ independentPieces: 1, independentDecisions: 1,
      unavailableReferences: 0, ungroupedReferences: 0 });
    for (const ref of refs) expect(await getProposalEvidencePieceKey(own.scope, ref)).toBe(own.output.outputKey);
  });

  it("never resolves another workspace or another brand, including historical and linked references", async () => {
    for (const inaccessible of [foreign, otherBrand]) {
      const row = await rule(own, inaccessible.refs, inaccessible.refs.map(ref => ref.id));
      const result = await report(own, row.id);
      expect(result?.support.every(ref => ref.availability === "unavailable" && ref.summary === null && ref.pieceHref === null)).toBe(true);
      for (const ref of inaccessible.refs) expect(await getProposalEvidencePieceKey(own.scope, ref)).toBeNull();
      const foreignRule = await rule(inaccessible);
      expect(await report(own, foreignRule.id)).toBeNull();
    }
    const row = await rule(own, [{ kind: "calibration_signal", id: own.signal.id }]);
    await db.update(calibrationSignals).set({ outputDecisionEventId: foreign.refs[4].id }).where(eq(calibrationSignals.id, own.signal.id));
    const result = await report(own, row.id);
    expect(result?.support[1]).toMatchObject({ kind: "output_decision", availability: "unavailable", summary: null });
  });

  it.each(["human", "agent"] as const)("verifies real artifact types without hiding ambiguity with a %s signal", async (authorType) => {
    const artifactId = own.corpus[authorType === "human" ? 0 : 1].artifact.id;
    const row = await rule(own, [], [artifactId]);
    expect((await report(own, row.id))?.support[0]).toMatchObject({ kind: "feedback_artifact", id: artifactId, availability: "available" });
    await db.insert(calibrationSignals).values({ ...own.scope, id: artifactId, authorType, creativeWorkOutputId: own.output.id, humanVerdict: "entra", sourceLabel: "synthetic_fixture", reviewerId: actorId, reviewedAt: new Date() });
    expect((await report(own, row.id))?.support[0]).toMatchObject({ kind: "legacy", availability: "unavailable" });
    const explicit = await rule(own, [{ kind: "feedback_artifact", id: artifactId }]);
    expect((await report(own, explicit.id))?.support[0]).toMatchObject({ kind: "feedback_artifact", availability: "available" });
  });

  it("opens captured before/after Item versions without substituting the live current version", async () => {
    const versions = await db.insert(equipeItemVersions).values([
      { workspaceId: own.scope.workspaceId, accountId: own.account.id, itemId: own.equipeItem.id, versionHash: "b".repeat(64), caption: "Texto da versão decidida", authorRole: "copy" },
      { workspaceId: own.scope.workspaceId, accountId: own.account.id, itemId: own.equipeItem.id, versionHash: "c".repeat(64), caption: "Texto futuro que não é evidência desta decisão", authorRole: "copy" },
    ]).returning();
    await db.update(equipeItems).set({ currentVersionHash: versions[1].versionHash }).where(eq(equipeItems.id, own.equipeItem.id));
    const [event] = await db.insert(equipeEvents).values({ workspaceId: own.scope.workspaceId, accountId: own.account.id,
      actorType: "client_person", eventType: "caption.edited", objectType: "item", objectId: own.equipeItem.id,
      payload: { versionHash: versions[0].versionHash, previousVersionHash: own.version.versionHash, note: "Tornar o convite mais direto" },
    }).returning();
    const row = await rule(own, [{ kind: "equipe_event", id: event.id }]);
    const result = await report(own, row.id);
    expect(result?.support.filter(ref => ref.kind === "equipe_item_version").map(ref => ref.id)).toEqual([versions[0].id, own.version.id]);
    expect(JSON.stringify(result)).not.toContain("Texto futuro");
    expect(result?.support[0].summary).toContain("Tornar o convite mais direto");
    const [missingVersion] = await db.insert(equipeEvents).values({ workspaceId: own.scope.workspaceId, accountId: own.account.id,
      actorType: "client_person", eventType: "item.adjustment_requested", objectType: "item", objectId: own.equipeItem.id,
      payload: { note: "Ajustar o título" },
    }).returning();
    const missing = await rule(own, [{ kind: "equipe_event", id: missingVersion.id }]);
    const limited = await report(own, missing.id);
    expect(limited?.support).toHaveLength(1);
    expect(limited?.caveats).toContain("Evento sem referência verificável à Versão do Item.");
  });

  it("persists corpus acceptance as typed item/artifact references, never as signals", async () => {
    const [proposal] = await db.insert(clientLearningProposals).values({ ...own.scope, sliceKey: randomUUID(), primaryFailureReason: "weak_hierarchy", rationale: "Uma mensagem principal", evidenceRefs: {
      corpusItemIds: own.corpus.map(row => row.item.id), artifactIds: own.corpus.map(row => row.artifact.id), fixtureOnly: true,
      stats: { count: 3, meanSignedDelta: 20, meanAbsError: 20, overScoreCount: 3, underScoreCount: 0 },
    } }).returning();
    const accepted = await acceptClientLearningProposal({ proposalId: proposal.id, reviewerUserId: actorId, acknowledgeFixtureOnly: true });
    expect(accepted.rule.supportingSignalIds).toEqual([]);
    expect(accepted.rule.supportingEvidenceRefs).toEqual([
      ...own.corpus.map(row => ({ kind: "corpus_item", id: row.item.id })),
      ...own.corpus.map(row => ({ kind: "feedback_artifact", id: row.artifact.id })),
    ]);
    expect(JSON.stringify(accepted.rule.supportingEvidenceRefs)).not.toMatch(/https:|outputKey|signedUrl/);
    const proposed = await loadProposalEvidence({ ...own.scope, proposalId: proposal.id, proposalKind: "corpus_quality" });
    expect(proposed?.support.filter(ref => ref.kind === "corpus_evaluation")).toHaveLength(3);
    expect(proposed?.counts).toEqual({ independentPieces: 3, independentDecisions: 3,
      unavailableReferences: 0, ungroupedReferences: 0 });
    expect(proposed?.caveats.join(" ")).toContain("fixture");
  });

  it("shows missing and removed evidence as limitations without a piece link or a verified claim", async () => {
    await db.update(humanQualityCorpusItems).set({ status: "removed" }).where(eq(humanQualityCorpusItems.id, own.corpus[2].item.id));
    const row = await rule(own, [{ kind: "feedback_artifact", id: own.corpus[2].artifact.id }, { kind: "output_decision", id: randomUUID() }]);
    const result = await report(own, row.id);
    expect(result?.support.map(ref => ref.availability)).toEqual(["removed", "unavailable"]);
    expect(result?.counts).toEqual({ independentPieces: 0, independentDecisions: 0,
      unavailableReferences: 2, ungroupedReferences: 0 });
    expect(result?.support.every(ref => ref.summary === null && ref.pieceHref === null)).toBe(true);
    expect(result?.caveats.join(" ")).toContain("não foi possível conferir");
    expect(await getProposalEvidencePieceKey(own.scope, own.refs[0])).not.toBeNull();
    expect(await getProposalEvidencePieceKey(own.scope, { kind: "feedback_artifact", id: own.corpus[2].artifact.id })).toBeNull();
  });
});
