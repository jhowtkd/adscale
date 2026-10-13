import "server-only";
import { readGenerationIdentity, type GenerationIdentity } from "../output-learning/generation-identity";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { isHumanDecisionAuthor } from "../output-learning/output-decision-author";
import {
  calibrationRules, calibrationSignals, campaigns, clientLearningProposals,
  creativeWorkItems, creativeWorkOutputs, derivations, humanQualityCorpusItems,
  humanQualityEvaluations, humanQualityFeedbackArtifacts, outputDecisionEvents,
} from "../db/schema";
import { equipeAccounts, equipeEvents, equipeItems, equipeItemVersions } from "../db/equipe-schema";
import {
  PROPOSAL_EVIDENCE_KINDS,
  type ProposalEvidenceRef, type ProposalEvidenceReport, type ResolvedProposalEvidence,
} from "./proposal-evidence-types";

type Scope = { workspaceId: string; clientProfileId: string };
type LoadedEvidence = {
  summary: string;
  generationIdentity?: GenerationIdentity;
  removed?: boolean;
  // An ineligible author still exists for historical type/ID disambiguation.
  unavailable?: boolean;
  sourceLabel?: string;
  strength?: string;
  occurredAt?: string;
  derivationId?: string | null;
  creativeWorkOutputId?: string | null;
  linked?: ProposalEvidenceRef[];
  caveats?: string[];
  corpusItemId?: string;
  decisionContext?: string;
  isDecision?: boolean;
};
const uuid = z.string().uuid();
const refSchema = z.object({ kind: z.enum(PROPOSAL_EVIDENCE_KINDS), id: uuid });
const LABELS: Record<ProposalEvidenceRef["kind"] | "legacy", string> = {
  corpus_item: "Item do corpus", corpus_evaluation: "Avaliação do corpus",
  feedback_artifact: "Feedback do corpus", calibration_signal: "Sinal de calibração",
  output_decision: "Decisão sobre a Peça", equipe_event: "Evento da Equipe",
  equipe_item_version: "Versão do Item", legacy: "Referência histórica",
};
const excerpt = (text: string) => text.length > 1000 ? `${text.slice(0, 1000)}… (trecho)` : text;
const INTENTS: Record<string, string> = { approve: "Aprovar", reject: "Rejeitar", regenerate: "Regenerar" };
const REASONS: Record<string, string> = {
  visual_overload: "Sobrecarga visual", weak_hierarchy: "Hierarquia fraca", generic_template_feel: "Aparência genérica",
  illegible_cta: "Convite ilegível", unfocused_composition: "Composição sem foco", factual_issue: "Problema factual",
  format_or_crop_issue: "Problema de formato ou recorte", other: "Outro motivo",
};
const VERDICTS: Record<string, string> = { entra: "Aprovada", quase: "Pedido de ajuste", nao_entra: "Rejeitada" };
const ACTIONS: Record<string, string> = {
  approved: "Aprovação", rejected: "Rejeição", regenerated: "Pedido de refinamento", saved_reference: "Referência salva",
  selected_for_delivery: "Seleção para entrega", alternative_not_selected: "Alternativa não escolhida", favorited: "Favorito",
  favorite_removed: "Favorito retirado", selection_replaced: "Seleção substituída", variation_requested: "Pedido de variação",
  format_adapted: "Adaptação de formato", layer_regenerated: "Regeneração de camada",
};
const EVENTS: Record<string, string> = {
  "item.adjustment_requested": "Ajuste solicitado", "item.adjusted": "Item ajustado",
  "caption.edited": "Legenda editada", "item.approved": "Item aprovado",
  "item.declined": "Item rejeitado", "idea.decided": "Decisão sobre a Ideia",
};

/** Every lookup carries the workspace and brand, including the referenced parents. */
async function readEvidence(scope: Scope, ref: ProposalEvidenceRef): Promise<LoadedEvidence | null> {
  if (!uuid.safeParse(ref.id).success) return null;
  switch (ref.kind) {
    case "corpus_item": {
      const [row] = await db.select().from(humanQualityCorpusItems).where(and(
        eq(humanQualityCorpusItems.id, ref.id), eq(humanQualityCorpusItems.workspaceId, scope.workspaceId),
        eq(humanQualityCorpusItems.clientProfileId, scope.clientProfileId),
      )).limit(1);
      return row ? { summary: `Corpus ${row.corpusVersion} · ${row.generationMode} · ${row.format}`,
        removed: row.status === "removed", derivationId: row.derivationId, corpusItemId: row.id } : null;
    }
    case "corpus_evaluation": {
      const [row] = await db.select({ evaluation: humanQualityEvaluations, item: humanQualityCorpusItems })
        .from(humanQualityEvaluations).innerJoin(humanQualityCorpusItems,
          eq(humanQualityEvaluations.corpusItemId, humanQualityCorpusItems.id))
        .where(and(eq(humanQualityEvaluations.id, ref.id),
          eq(humanQualityEvaluations.workspaceId, scope.workspaceId),
          eq(humanQualityCorpusItems.workspaceId, scope.workspaceId),
          eq(humanQualityCorpusItems.clientProfileId, scope.clientProfileId))).limit(1);
      return row ? { summary: `${INTENTS[row.evaluation.intent] ?? "Avaliação"} · nota visual ${row.evaluation.visualScore}/100 · factual ${row.evaluation.factualPass ? "aprovado" : "reprovado"} · ${REASONS[row.evaluation.primaryFailureReason] ?? "Motivo não identificado"}${row.evaluation.notes ? ` · ${excerpt(row.evaluation.notes)}` : ""}`,
        removed: row.item.status === "removed", derivationId: row.item.derivationId,
        corpusItemId: row.item.id, isDecision: true,
        linked: [{ kind: "corpus_item", id: row.item.id }] } : null;
    }
    case "feedback_artifact": {
      const [row] = await db.select({ artifact: humanQualityFeedbackArtifacts, item: humanQualityCorpusItems })
        .from(humanQualityFeedbackArtifacts).innerJoin(humanQualityCorpusItems,
          eq(humanQualityFeedbackArtifacts.corpusItemId, humanQualityCorpusItems.id))
        .where(and(eq(humanQualityFeedbackArtifacts.id, ref.id),
          eq(humanQualityFeedbackArtifacts.workspaceId, scope.workspaceId),
          eq(humanQualityFeedbackArtifacts.clientProfileId, scope.clientProfileId),
          eq(humanQualityCorpusItems.workspaceId, scope.workspaceId),
          eq(humanQualityCorpusItems.clientProfileId, scope.clientProfileId))).limit(1);
      return row ? { summary: `${INTENTS[row.artifact.payload.evaluation?.intent] ?? "Avaliação"} · ${REASONS[row.artifact.payload.evaluation?.primaryFailureReason] ?? "Motivo indisponível"}`,
        sourceLabel: row.artifact.sourceLabel, removed: row.item.status === "removed",
        corpusItemId: row.item.id, isDecision: true,
        derivationId: row.item.derivationId, linked: [
          { kind: "corpus_item", id: row.item.id },
          { kind: "corpus_evaluation", id: row.artifact.evaluationId },
        ] } : null;
    }
    case "calibration_signal": {
      const [row] = await db.select().from(calibrationSignals).where(and(
        eq(calibrationSignals.id, ref.id), eq(calibrationSignals.workspaceId, scope.workspaceId),
        eq(calibrationSignals.clientProfileId, scope.clientProfileId),
      )).limit(1);
      if (row && !isHumanDecisionAuthor(row)) return { summary: "", unavailable: true };
      return row ? { summary: `${VERDICTS[row.humanVerdict] ?? "Decisão registrada"}${row.sanitizedNote ? ` · ${excerpt(row.sanitizedNote)}` : ""}`,
        sourceLabel: row.sourceLabel, occurredAt: row.reviewedAt.toISOString(),
        isDecision: true,
        derivationId: row.derivationId, creativeWorkOutputId: row.creativeWorkOutputId,
        linked: [
          ...(row.outputDecisionEventId ? [{ kind: "output_decision" as const, id: row.outputDecisionEventId }] : []),
          ...(row.equipeEventId ? [{ kind: "equipe_event" as const, id: row.equipeEventId }] : []),
        ] } : null;
    }
    case "output_decision": {
      const [row] = await db.select().from(outputDecisionEvents).where(and(
        eq(outputDecisionEvents.id, ref.id), eq(outputDecisionEvents.workspaceId, scope.workspaceId),
        eq(outputDecisionEvents.clientProfileId, scope.clientProfileId),
      )).limit(1);
      if (row && !isHumanDecisionAuthor(row)) return { summary: "", unavailable: true };
      return row ? { summary: `${ACTIONS[row.action] ?? "Decisão registrada"}${row.contextSnapshot.reason?.text ? ` · ${excerpt(row.contextSnapshot.reason.text)}` : ""}`,
        generationIdentity: readGenerationIdentity(row.contextSnapshot.generationIdentity),
        strength: row.strength, occurredAt: row.createdAt.toISOString(),
        isDecision: true,
        derivationId: row.derivationId, creativeWorkOutputId: row.creativeWorkOutputId,
        linked: row.equipeEventId ? [{ kind: "equipe_event", id: row.equipeEventId }] : [] } : null;
    }
    case "equipe_event": {
      const [row] = await db.select({ event: equipeEvents }).from(equipeEvents)
        .innerJoin(equipeAccounts, eq(equipeEvents.accountId, equipeAccounts.id))
        .where(and(eq(equipeEvents.id, ref.id), eq(equipeEvents.workspaceId, scope.workspaceId),
          eq(equipeAccounts.workspaceId, scope.workspaceId), eq(equipeAccounts.clientProfileId, scope.clientProfileId))).limit(1);
      if (!row) return null;
      const payload = row.event.payload as { versionHash?: unknown; previousVersionHash?: unknown; note?: unknown; reason?: unknown } | null;
      const linked: ProposalEvidenceRef[] = [];
      const caveats: string[] = [];
      if (row.event.objectType === "item" && row.event.objectId) {
        const hashes = [...new Set([payload?.versionHash, payload?.previousVersionHash].filter((hash): hash is string => typeof hash === "string" && hash.length > 0))];
        if (!hashes.length) caveats.push("Evento sem referência verificável à Versão do Item.");
        for (const hash of hashes) {
          const [version] = await db.select({ id: equipeItemVersions.id }).from(equipeItemVersions)
            .innerJoin(equipeItems, and(eq(equipeItemVersions.itemId, equipeItems.id), eq(equipeItems.accountId, row.event.accountId)))
            .where(and(eq(equipeItemVersions.workspaceId, scope.workspaceId),
              eq(equipeItems.workspaceId, scope.workspaceId),
              eq(equipeItemVersions.accountId, row.event.accountId), eq(equipeItemVersions.itemId, row.event.objectId),
              eq(equipeItemVersions.versionHash, hash))).limit(1);
          if (version) linked.push({ kind: "equipe_item_version", id: version.id });
          else caveats.push("Versão do Item indisponível para este evento.");
        }
      }
      const note = typeof payload?.note === "string" ? payload.note : typeof payload?.reason === "string" ? payload.reason : null;
      return { summary: `${EVENTS[row.event.eventType] ?? "Evento registrado"} · autoria ${row.event.actorType === "agent" ? "de agente" : row.event.actorType === "system" ? "do sistema" : "humana"}${note ? ` · ${excerpt(note)}` : ""}`,
        isDecision: row.event.actorType !== "agent" && row.event.actorType !== "system",
        decisionContext: linked.length ? `equipe_item:${row.event.objectId}` : undefined,
        occurredAt: row.event.occurredAt.toISOString(), linked, caveats };
    }
    case "equipe_item_version": {
      const [row] = await db.select({ version: equipeItemVersions }).from(equipeItemVersions)
        .innerJoin(equipeAccounts, eq(equipeItemVersions.accountId, equipeAccounts.id))
        .innerJoin(equipeItems, and(eq(equipeItemVersions.itemId, equipeItems.id), eq(equipeItems.accountId, equipeAccounts.id)))
        .where(and(eq(equipeItemVersions.id, ref.id), eq(equipeItemVersions.workspaceId, scope.workspaceId),
          eq(equipeItems.workspaceId, scope.workspaceId), eq(equipeAccounts.workspaceId, scope.workspaceId),
          eq(equipeAccounts.clientProfileId, scope.clientProfileId))).limit(1);
      return row ? { summary: `${row.version.versionHash} · ${excerpt(row.version.caption)}`,
        occurredAt: row.version.createdAt.toISOString(), creativeWorkOutputId: row.version.creativeWorkOutputId } : null;
    }
  }
}

async function pieceKey(scope: Scope, record: LoadedEvidence): Promise<string | null> {
  if (record.removed || record.unavailable) return null;
  if (record.creativeWorkOutputId) {
    const [row] = await db.select({ key: creativeWorkOutputs.outputKey }).from(creativeWorkOutputs)
      .innerJoin(creativeWorkItems, eq(creativeWorkOutputs.workItemId, creativeWorkItems.id))
      .where(and(eq(creativeWorkOutputs.id, record.creativeWorkOutputId), eq(creativeWorkOutputs.workspaceId, scope.workspaceId),
        eq(creativeWorkItems.workspaceId, scope.workspaceId), eq(creativeWorkItems.clientProfileId, scope.clientProfileId))).limit(1);
    return row?.key ?? null;
  }
  if (record.derivationId) {
    const [row] = await db.select({ key: derivations.outputKey }).from(derivations)
      .innerJoin(campaigns, eq(derivations.campaignId, campaigns.id))
      .where(and(eq(derivations.id, record.derivationId), eq(derivations.workspaceId, scope.workspaceId),
        eq(campaigns.workspaceId, scope.workspaceId), eq(campaigns.clientProfileId, scope.clientProfileId))).limit(1);
    return row?.key ?? null;
  }
  return null;
}

export async function getProposalEvidencePieceKey(scope: Scope, ref: ProposalEvidenceRef): Promise<string | null> {
  const record = await readEvidence(scope, ref);
  return record ? pieceKey(scope, record) : null;
}

export async function loadProposalEvidence(input: Scope & {
  proposalKind: ProposalEvidenceReport["kind"]; proposalId: string;
}): Promise<ProposalEvidenceReport | null> {
  let refs: Array<ProposalEvidenceRef | { kind: "legacy"; id: string }>;
  let caveats: string[];
  if (input.proposalKind === "rule") {
    const [row] = await db.select().from(calibrationRules).where(and(
      eq(calibrationRules.id, input.proposalId), eq(calibrationRules.workspaceId, input.workspaceId),
      eq(calibrationRules.clientProfileId, input.clientProfileId))).limit(1);
    if (!row) return null;
    refs = [...row.supportingEvidenceRefs.map(ref => {
      const parsed = refSchema.safeParse(ref);
      return parsed.success ? parsed.data : { kind: "legacy" as const, id: "" };
    }), ...row.supportingSignalIds.map(id => ({ kind: "legacy" as const, id: uuid.safeParse(id).success ? id : "" }))];
    caveats = [...row.caveats];
  } else {
    const [row] = await db.select().from(clientLearningProposals).where(and(
      eq(clientLearningProposals.id, input.proposalId), eq(clientLearningProposals.workspaceId, input.workspaceId),
      eq(clientLearningProposals.clientProfileId, input.clientProfileId))).limit(1);
    if (!row) return null;
    refs = [
      ...row.evidenceRefs.corpusItemIds.map(id => ({ kind: "corpus_item" as const, id })),
      ...(row.evidenceRefs.artifactIds ?? []).map(id => ({ kind: "feedback_artifact" as const, id })),
    ];
    caveats = row.evidenceRefs.fixtureOnly ? ["Evidência apenas de fixture — não é validação com cliente real."] : [];
  }

  const support: ResolvedProposalEvidence[] = [];
  const seen = new Set<string>();
  const pieces = new Set<string>();
  const decisions = new Map<string, string | null>();
  const decisionRefs = new Set<string>();
  const decisionLinks: Array<[string, string]> = [];
  for (let i = 0; i < refs.length; i += 1) {
    let ref = refs[i];
    if (seen.has(`${ref.kind}:${ref.id}`)) continue;
    seen.add(`${ref.kind}:${ref.id}`);
    let record: LoadedEvidence | null = null;
    if (ref.kind === "legacy") {
      // Historical IDs are ambiguous until the actual scoped record is verified.
      const matches = await Promise.all(PROPOSAL_EVIDENCE_KINDS.map(async kind => ({ kind, record: await readEvidence(input, { kind, id: ref.id }) })));
      const found = matches.filter(match => match.record !== null);
      if (found.length === 1) {
        ref = { kind: found[0].kind, id: ref.id }; record = found[0].record;
        if (seen.has(`${ref.kind}:${ref.id}`)) continue;
        seen.add(`${ref.kind}:${ref.id}`);
      }
    } else {
      record = await readEvidence(input, ref);
    }
    const available = record !== null && !record.removed && !record.unavailable;
    const key = available ? await pieceKey(input, record!) : null;
    if (available) {
      const piece = key ? record!.creativeWorkOutputId ? `output:${record!.creativeWorkOutputId}`
        : `derivation:${record!.derivationId}` : record!.corpusItemId ? `corpus:${record!.corpusItemId}` : null;
      if (piece) pieces.add(piece);
      // Count one decision context per Peça/Item, never the expanded records or people.
      const context = record!.decisionContext ?? piece;
      decisions.set(`${ref.kind}:${ref.id}`, context ?? null);
      if (record!.isDecision) decisionRefs.add(`${ref.kind}:${ref.id}`);
      for (const linked of record!.linked ?? []) decisionLinks.push([`${ref.kind}:${ref.id}`, `${linked.kind}:${linked.id}`]);
    }
    const params = new URLSearchParams({ proposalKind: input.proposalKind, proposalId: input.proposalId,
      evidenceKind: ref.kind, evidenceId: ref.id, view: "piece" });
    support.push({ kind: ref.kind, id: ref.id,
      availability: record?.removed ? "removed" : available ? "available" : "unavailable",
      label: LABELS[ref.kind], summary: available ? record!.summary : null,
      ...(available && record!.sourceLabel ? { sourceLabel: record!.sourceLabel } : {}),
      ...(available && record!.strength ? { strength: record!.strength } : {}),
      ...(available && record!.occurredAt ? { occurredAt: record!.occurredAt } : {}),
      ...(available && record!.generationIdentity ? { generationIdentity: record!.generationIdentity } : {}),
      pieceHref: key ? `/api/admin/quality/brands/${input.clientProfileId}/evidence?${params}` : null,
    });
    if (available) refs.push(...(record!.linked ?? []));
    if (available) caveats.push(...(record!.caveats ?? []));
    if (available && (record!.derivationId || record!.creativeWorkOutputId) && !key) caveats.push("Peça indisponível para esta referência.");
  }
  if (support.length === 0) caveats.push("Nenhuma referência de apoio disponível para conferência.");
  if (support.some(ref => ref.availability !== "available")) caveats.push("Parte da evidência está indisponível ou removida; não foi possível conferir essas referências.");
  for (const [parent, child] of decisionLinks) {
    const parentContext = decisions.get(parent);
    const childContext = decisions.get(child);
    if (decisions.has(parent) && decisions.has(child) && (parentContext || childContext)) {
      const merged = parentContext ?? childContext!;
      for (const [id, context] of decisions) {
        if (id === parent || id === child || (context && (context === parentContext || context === childContext))) decisions.set(id, merged);
      }
    }
  }
  return { id: input.proposalId, kind: input.proposalKind, support, caveats: [...new Set(caveats)], counts: {
    independentPieces: pieces.size,
    independentDecisions: new Set([...decisionRefs].map(id => decisions.get(id)).filter(context => context != null)).size,
    unavailableReferences: support.filter(ref => ref.availability !== "available").length,
    ungroupedReferences: [...decisionRefs].filter(id => decisions.get(id) === null).length,
  } };
}
