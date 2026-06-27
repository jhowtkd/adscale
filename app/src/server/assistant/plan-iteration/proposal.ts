import { planVersionSnapshotSchema } from "@/lib/assistant/artifact-version";
import { getOpenAI } from "@/server/ai/utils";
import { adoptArtifactForThread } from "@/server/assistant/artifact-version/service";
import { buildPlanSnapshot } from "@/server/assistant/artifact-version/snapshots";
import { env } from "@/server/validation/env";
import { getPlanByCampaign } from "@/server/repositories/plan";
import {
  ArtifactVersionValidationError,
  createArtifactProposal,
  createArtifactVersion,
  getArtifactHead,
  getArtifactLineage,
  getArtifactProposal,
  getArtifactVersion,
  listArtifactLineages,
  listArtifactVersions,
  staleSiblingProposals,
  transitionArtifactProposal,
  updateArtifactHead,
  type ArtifactScope,
} from "@/server/repositories/artifact-version";
import { buildPlanSemanticChanges } from "./diff";
import { canonicalProposalPayloadDigest } from "./digest";
import { clearPlanFeedbackDraft, savePlanFeedbackDraft } from "./draft";
import type {
  PlanRevisionProposalResult,
  PlanRevisionResult,
  PlanRevisionSource,
  PlanRevisionSourceResult,
  PlanVersionSnapshot,
} from "./types";

const VAGUE_PATTERNS = [
  /^(melhora|melhorar|ajusta|ajustar|refina|refinar)(\s+(o|a))?\s+plano/,
  /^plano\s+(melhor|ruim|fraco)/,
];

const OUT_OF_SCOPE_PATTERNS = [
  /\b(público|publico|audiência|audiencia|briefing|campanha|oferta|produto|marca)\b/,
];

export type PlanRevisionModelOutput = {
  strategy: string | null;
  angles: string[];
  hooks: string[];
  ctas: string[];
  constraints: string | null;
};

export type GenerateRevisedPlanSnapshot = (
  source: PlanVersionSnapshot,
  feedback: string
) => Promise<PlanRevisionModelOutput>;

export function classifyPlanFeedback(feedback: string): "clarify" | "out_of_scope" | "propose" {
  const normalized = feedback.trim().toLowerCase();
  if (normalized.length < 12 || VAGUE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "clarify";
  }
  if (OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "out_of_scope";
  }
  return "propose";
}

function versionLabel(versionNumber: number): string {
  return `v${versionNumber}`;
}

function buildNeutralSummary(changes: { field: string; description: string }[]): string {
  if (changes.length === 0) {
    return "Revisão do plano sem alterações semânticas detectadas.";
  }
  const fields = changes.map((change) => change.field).join(", ");
  return `Revisão do plano com alterações em: ${fields}.`;
}

function buildConfirmWrites(nextVersionNumber: number): string[] {
  return [
    `Cria ${versionLabel(nextVersionNumber)} do plano`,
    "Não altera a versão aprovada atual",
  ];
}

async function defaultGenerateRevisedPlanSnapshot(
  source: PlanVersionSnapshot,
  feedback: string
): Promise<PlanRevisionModelOutput> {
  const prompt = `Revise o plano criativo abaixo conforme o feedback do usuário.
Retorne APENAS JSON válido com as chaves: strategy, angles, hooks, ctas, constraints.
Mantenha campos não mencionados no feedback iguais ao plano atual.

Plano atual:
${JSON.stringify({
  strategy: source.strategy,
  angles: source.angles,
  hooks: source.hooks,
  ctas: source.ctas,
  constraints: source.constraints,
})}

Feedback:
${feedback}`;

  const completion = await getOpenAI().chat.completions.create({
    model: env.OPENAI_TEXT_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 2048,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new ArtifactVersionValidationError("Plan revision generation failed");
  }

  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonString = jsonMatch ? jsonMatch[1]!.trim() : raw.trim();
  const parsed = JSON.parse(jsonString) as PlanRevisionModelOutput;
  return {
    strategy: parsed.strategy ?? source.strategy,
    angles: parsed.angles ?? source.angles,
    hooks: parsed.hooks ?? source.hooks,
    ctas: parsed.ctas ?? source.ctas,
    constraints: parsed.constraints ?? source.constraints,
  };
}

export async function resolvePlanRevisionSource(
  scope: ArtifactScope,
  lineageId: string
): Promise<PlanRevisionSourceResult> {
  const lineage = await getArtifactLineage(scope, lineageId);
  if (!lineage || lineage.artifactType !== "plan") {
    return {
      kind: "ask_target",
      question: "Qual plano você quer revisar nesta conversa?",
    };
  }

  const head = await getArtifactHead(scope, lineageId);
  if (!head) {
    return {
      kind: "ask_target",
      question: "Qual versão do plano devo usar como base para esta revisão?",
    };
  }

  const sourceVersionId = head.workingVersionId ?? head.approvedCurrentVersionId;
  if (!sourceVersionId) {
    return {
      kind: "ask_target",
      question: "Ainda não há uma versão do plano disponível para revisar. Qual plano devo adotar?",
    };
  }

  const sourceVersion = await getArtifactVersion(scope, sourceVersionId);
  if (!sourceVersion || sourceVersion.lineageId !== lineageId) {
    throw new ArtifactVersionValidationError("Invalid revision source version");
  }

  const approvedVersionId = head.approvedCurrentVersionId;
  let approvedVersionNumber: number | null = null;
  if (approvedVersionId) {
    const approved = await getArtifactVersion(scope, approvedVersionId);
    approvedVersionNumber = approved?.versionNumber ?? null;
  }

  const sourceSnapshot = planVersionSnapshotSchema.parse(sourceVersion.snapshot);

  return {
    kind: "resolved",
    source: {
      lineageId,
      sourceVersionId,
      sourceVersionNumber: sourceVersion.versionNumber,
      sourceSnapshot,
      approvedVersionId,
      approvedVersionNumber,
      workingDiffersFromApproved:
        Boolean(approvedVersionId) && approvedVersionId !== sourceVersionId,
      sourceVersionLabel: versionLabel(sourceVersion.versionNumber),
      approvedVersionLabel:
        approvedVersionNumber !== null ? versionLabel(approvedVersionNumber) : null,
    },
  };
}

async function ensurePlanLineage(
  scope: ArtifactScope
): Promise<{ lineageId: string } | { kind: "ask_target"; question: string }> {
  const planLineages = (await listArtifactLineages(scope)).filter(
    (lineage) => lineage.artifactType === "plan"
  );
  if (planLineages.length === 1) {
    return { lineageId: planLineages[0]!.id };
  }
  if (planLineages.length > 1) {
    return {
      kind: "ask_target",
      question: "Qual plano desta conversa você quer revisar?",
    };
  }

  const campaignPlan = await getPlanByCampaign(scope.campaignId, scope.workspaceId);
  if (!campaignPlan) {
    return {
      kind: "ask_target",
      question: "Não encontrei um plano nesta campanha. Quer criar ou selecionar um plano primeiro?",
    };
  }

  const adopted = await adoptArtifactForThread({
    workspaceId: scope.workspaceId,
    threadId: scope.threadId,
    artifactType: "plan",
    artifactId: campaignPlan.id,
  });
  return { lineageId: adopted.lineageId };
}

export async function proposePlanRevision(input: {
  scope: ArtifactScope;
  feedback: string;
  messageId?: string | null;
  generateRevisedPlanSnapshot?: GenerateRevisedPlanSnapshot;
}): Promise<PlanRevisionResult> {
  const feedback = input.feedback.trim();
  if (!feedback) {
    return {
      kind: "clarify",
      question: "O que você quer mudar no plano? Pode citar estratégia, ângulos, hooks, CTAs ou restrições.",
    };
  }

  const classification = classifyPlanFeedback(feedback);
  if (classification === "clarify") {
    await savePlanFeedbackDraft(input.scope, feedback);
    return {
      kind: "clarify",
      question:
        "Pode detalhar o que deve mudar no plano? Ex.: ajustar o CTA, reforçar um ângulo ou alterar a estratégia.",
    };
  }
  if (classification === "out_of_scope") {
    return {
      kind: "redirect",
      message:
        "Esse pedido parece alterar briefing ou campanha. Volte à jornada guiada para ajustar oferta, público ou objetivo.",
    };
  }

  const lineageResult = await ensurePlanLineage(input.scope);
  if ("kind" in lineageResult) {
    return lineageResult;
  }

  const sourceResult = await resolvePlanRevisionSource(
    input.scope,
    lineageResult.lineageId
  );
  if (sourceResult.kind !== "resolved") {
    return sourceResult;
  }

  const { source } = sourceResult;
  const generate =
    input.generateRevisedPlanSnapshot ?? defaultGenerateRevisedPlanSnapshot;
  const modelOutput = await generate(source.sourceSnapshot, feedback);
  const proposedSnapshot = planVersionSnapshotSchema.parse(
    buildPlanSnapshot(modelOutput)
  );
  const changes = buildPlanSemanticChanges(source.sourceSnapshot, proposedSnapshot);
  const summary = buildNeutralSummary(changes);
  const head = await getArtifactHead(input.scope, source.lineageId);
  const nextVersionNumber = source.sourceVersionNumber + 1;
  const writes = buildConfirmWrites(nextVersionNumber);

  const payload = {
    type: "plan_revision" as const,
    schemaVersion: 1 as const,
    summary,
    proposedSnapshot,
    changes,
    writes,
  };

  const proposal = await createArtifactProposal({
    scope: input.scope,
    lineageId: source.lineageId,
    sourceVersionId: source.sourceVersionId,
    proposalType: "plan_revision",
    payload,
    feedback,
  });

  await clearPlanFeedbackDraft(input.scope);

  const result: PlanRevisionProposalResult = {
    kind: "proposal",
    proposalId: proposal.id,
    lineageId: source.lineageId,
    sourceVersionId: source.sourceVersionId,
    sourceVersionNumber: source.sourceVersionNumber,
    lineageHeadRevision: head?.revision ?? 0,
    payloadDigest: canonicalProposalPayloadDigest(payload),
    sourceVersionLabel: source.sourceVersionLabel,
    approvedVersionLabel: source.approvedVersionLabel,
    workingDiffersFromApproved: source.workingDiffersFromApproved,
    summary,
    changes,
    writes,
    payload,
  };

  return result;
}

export async function cancelPlanRevision(scope: ArtifactScope, proposalId: string) {
  return transitionArtifactProposal({
    scope,
    proposalId,
    nextStatus: "canceled",
  });
}

export async function confirmPlanRevision(input: {
  scope: ArtifactScope;
  proposalId: string;
  lineageId: string;
  sourceVersionId: string;
  payloadDigest: string;
  messageId?: string | null;
  actionId?: string | null;
  lineageHeadRevision?: number;
}) {
  if (input.actionId) {
    const existing = await findVersionByActionId(
      input.scope,
      input.lineageId,
      input.actionId
    );
    if (existing) {
      return { version: existing, head: null, proposal: null, idempotent: true as const };
    }
  }

  const proposal = await getArtifactProposal(input.scope, input.proposalId);
  if (!proposal) {
    throw new ArtifactVersionValidationError("Proposal not found");
  }
  if (proposal.lineageId !== input.lineageId) {
    throw new ArtifactVersionValidationError("Proposal lineage mismatch");
  }
  if (proposal.sourceVersionId !== input.sourceVersionId) {
    throw new ArtifactVersionValidationError("Proposal source mismatch");
  }
  if (proposal.status === "stale") {
    throw new ArtifactVersionValidationError("Proposal is stale");
  }
  if (proposal.status !== "pending") {
    throw new ArtifactVersionValidationError("Proposal is not pending");
  }
  if (proposal.proposalType !== "plan_revision") {
    throw new ArtifactVersionValidationError("Invalid proposal type");
  }

  const payload = proposal.payload;
  if (payload.type !== "plan_revision") {
    throw new ArtifactVersionValidationError("Invalid proposal payload");
  }
  const digest = canonicalProposalPayloadDigest(payload);
  if (digest !== input.payloadDigest) {
    throw new ArtifactVersionValidationError("Proposal digest mismatch");
  }

  const head = await getArtifactHead(input.scope, input.lineageId);
  if (!head) {
    throw new ArtifactVersionValidationError("Lineage head not found");
  }
  if (
    input.lineageHeadRevision !== undefined &&
    head.revision !== input.lineageHeadRevision
  ) {
    throw new ArtifactVersionValidationError("Lineage head revision is stale");
  }

  const sourceVersion = await getArtifactVersion(input.scope, input.sourceVersionId);
  if (!sourceVersion) {
    throw new ArtifactVersionValidationError("Source version not found");
  }

  const lineage = await getArtifactLineage(input.scope, input.lineageId);
  if (!lineage) {
    throw new ArtifactVersionValidationError("Lineage not found");
  }

  const created = await createArtifactVersion({
    scope: input.scope,
    lineageId: input.lineageId,
    sourceVersionId: input.sourceVersionId,
    status: "ready",
    snapshot: payload.proposedSnapshot,
    provenance: {
      origin: "revision",
      originalArtifactId: lineage.originalArtifactId,
      sourceVersionId: input.sourceVersionId,
      messageId: input.messageId ?? null,
      actionId: input.actionId ?? null,
      planVersionId: null,
      format: null,
      generationMode: null,
    },
    feedback: proposal.feedback,
  });

  await staleSiblingProposals({
    scope: input.scope,
    lineageId: input.lineageId,
    sourceVersionId: input.sourceVersionId,
    exceptProposalId: input.proposalId,
  });

  const confirmed = await transitionArtifactProposal({
    scope: input.scope,
    proposalId: input.proposalId,
    nextStatus: "confirmed",
  });

  const updatedHead = await updateArtifactHead({
    scope: input.scope,
    lineageId: input.lineageId,
    expectedRevision: head.revision,
    workingVersionId: created.id,
  });

  return {
    version: created,
    head: updatedHead,
    proposal: confirmed,
    idempotent: false as const,
  };
}

async function findVersionByActionId(
  scope: ArtifactScope,
  lineageId: string,
  actionId: string
) {
  const versions = await listArtifactVersions(scope, lineageId);
  return (
    versions.find((version) => {
      const provenance = version.provenance as { actionId?: string | null };
      return provenance.actionId === actionId;
    }) ?? null
  );
}
