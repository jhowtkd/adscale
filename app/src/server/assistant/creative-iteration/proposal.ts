import { and, eq, sql } from "drizzle-orm";
import { creativeVersionSnapshotSchema } from "@/lib/assistant/artifact-version";
import type { ArtifactProposalPayload } from "@/lib/assistant/artifact-version";
import { getOpenAI } from "@/server/ai/utils";
import {
  ArtifactVersionValidationError,
  createArtifactProposal,
  findActiveGenerationForLineage,
  getArtifactHead,
  getArtifactLineage,
  getArtifactProposal,
  getArtifactVersion,
  listArtifactLineages,
  listArtifactVersions,
  staleSiblingProposals,
  transitionArtifactProposal,
  type ArtifactScope,
} from "@/server/repositories/artifact-version";
import { env } from "@/server/validation/env";
import { canonicalProposalPayloadDigest } from "../plan-iteration/digest";
import {
  clearCreativeFeedbackDraft,
  saveCreativeFeedbackDraft,
} from "./draft";
import type {
  CreativeRevisionAskTargetResult,
  CreativeRevisionModelOutput,
  CreativeRevisionProposalResult,
  CreativeRevisionResult,
  CreativeRevisionSource,
  CreativeRevisionSourceResult,
  CreativeVersionSnapshot,
  GenerateCreativeRevisionProposal,
} from "./types";

const VAGUE_PATTERNS = [
  /^(melhora|melhorar|ajusta|ajustar|muda|mudar|troca|trocar|refina|refinar)(\s+(o|a))?$/i,
  /^(melhora|melhorar|ajusta|ajustar|muda|mudar|troca|trocar|refina|refinar)\s+(criativo|visual|esse|essa|isso|isto)$/i,
];

const FORMAT_CHANGE_PATTERNS = [
  /\b(9:16|1:1|16:9|formato|format|proporção|proporcao|vertical|horizontal|quadrado)\b/i,
];

const CREATIVE_CREDIT_COST = 5;

export type FindActiveGeneration = (
  scope: ArtifactScope,
  lineageId: string
) => Promise<boolean>;

function versionLabel(versionNumber: number): string {
  return `v${versionNumber}`;
}

export function classifyCreativeFeedback(feedback: string): "clarify" | "propose" {
  const normalized = feedback.trim().toLowerCase();
  if (
    normalized.length < 12 ||
    VAGUE_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return "clarify";
  }
  return "propose";
}

export async function resolveCreativeRevisionSource(
  scope: ArtifactScope,
  lineageId: string
): Promise<CreativeRevisionSourceResult> {
  const lineage = await getArtifactLineage(scope, lineageId);
  if (!lineage || lineage.artifactType !== "creative") {
    return {
      kind: "ask_target",
      question: "Qual criativo desta conversa você quer revisar?",
    };
  }

  const head = await getArtifactHead(scope, lineageId);
  if (!head) {
    return {
      kind: "ask_target",
      question: "Qual versão do criativo devo usar como base para esta revisão?",
    };
  }

  const sourceVersionId = head.workingVersionId ?? head.approvedCurrentVersionId;
  if (!sourceVersionId) {
    return {
      kind: "ask_target",
      question:
        "Ainda não há uma versão do criativo disponível para revisar. Qual criativo devo adotar?",
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

  const sourceSnapshot = creativeVersionSnapshotSchema.parse(
    sourceVersion.snapshot
  );

  const allLineages = await listArtifactLineages(scope);
  const planLineages = allLineages.filter(
    (entry) => entry.artifactType === "plan"
  );

  if (planLineages.length === 0) {
    return {
      kind: "ask_target",
      question:
        "Não encontrei um plano nesta campanha. Um plano precisa existir antes de revisar o criativo.",
    };
  }

  const planLineage = planLineages[0]!;
  const planHead = await getArtifactHead(scope, planLineage.id);
  if (!planHead) {
    return {
      kind: "ask_target",
      question:
        "Não encontrei um plano ativo nesta conversa. Adote um plano antes de revisar o criativo.",
    };
  }

  const frozenPlanVersionId =
    planHead.workingVersionId ?? planHead.approvedCurrentVersionId;
  if (!frozenPlanVersionId) {
    return {
      kind: "ask_target",
      question:
        "O plano desta conversa não tem versão ativa. Confirme uma versão do plano antes de revisar o criativo.",
    };
  }

  const planVersion = await getArtifactVersion(scope, frozenPlanVersionId);
  if (!planVersion) {
    throw new ArtifactVersionValidationError(
      "Frozen plan version not found for creative revision"
    );
  }

  return {
    kind: "resolved",
    source: {
      lineageId,
      sourceVersionId,
      sourceVersionNumber: sourceVersion.versionNumber,
      sourceSnapshot,
      planVersionId: frozenPlanVersionId,
      planVersionLabel: versionLabel(planVersion.versionNumber),
      approvedVersionId,
      approvedVersionNumber,
      workingDiffersFromApproved:
        Boolean(approvedVersionId) && approvedVersionId !== sourceVersionId,
      sourceVersionLabel: versionLabel(sourceVersion.versionNumber),
      approvedVersionLabel:
        approvedVersionNumber !== null
          ? versionLabel(approvedVersionNumber)
          : null,
    },
  };
}

async function ensureCreativeLineage(
  scope: ArtifactScope
): Promise<{ lineageId: string } | CreativeRevisionAskTargetResult> {
  const creativeLineages = (await listArtifactLineages(scope)).filter(
    (lineage) => lineage.artifactType === "creative"
  );
  if (creativeLineages.length === 1) {
    return { lineageId: creativeLineages[0]!.id };
  }
  if (creativeLineages.length > 1) {
    return {
      kind: "ask_target",
      question: "Qual criativo/formato você quer revisar?",
    };
  }
  return {
    kind: "ask_target",
    question: "Qual criativo desta conversa você quer revisar?",
  };
}

async function defaultGenerateCreativeRevisionProposal(
  source: CreativeVersionSnapshot,
  feedback: string
): Promise<CreativeRevisionModelOutput> {
  const prompt = `Revise o criativo abaixo conforme o feedback do usuário.
Retorne APENAS JSON válido com as chaves: intendedChanges (array de strings curtas), format (string ou null), summary (texto neutro curto descrevendo as alterações).
Foque apenas em mudanças visuais/cor/layout/imagem.

Criativo atual:
${JSON.stringify({
  format: source.format,
  generationMode: source.generationMode,
  ctaText: source.ctaText,
})}

Feedback:
${feedback}`;

  const completion = await getOpenAI().chat.completions.create({
    model: env.OPENAI_TEXT_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 1024,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new ArtifactVersionValidationError(
      "Creative revision generation failed"
    );
  }

  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonString = jsonMatch ? jsonMatch[1]!.trim() : raw.trim();
  const parsed = JSON.parse(jsonString) as Partial<CreativeRevisionModelOutput>;
  return {
    intendedChanges: Array.isArray(parsed.intendedChanges)
      ? parsed.intendedChanges.filter((entry): entry is string => typeof entry === "string")
      : [],
    format:
      typeof parsed.format === "string" ? parsed.format : source.format ?? null,
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : "Revisão visual do criativo.",
  };
}

function buildConfirmWrites(): string[] {
  return [
    "Gera nova versão do criativo",
    `Cobra ${CREATIVE_CREDIT_COST} créditos`,
    "Não altera a versão aprovada atual",
  ];
}

export async function proposeCreativeRevision(input: {
  scope: ArtifactScope;
  feedback: string;
  messageId?: string | null;
  attachmentReferenceIds?: string[];
  generateCreativeRevisionProposal?: GenerateCreativeRevisionProposal;
}): Promise<CreativeRevisionResult> {
  const feedback = input.feedback.trim();
  if (!feedback) {
    return {
      kind: "clarify",
      question:
        "O que você quer mudar no criativo? Pode citar cor, layout, imagem, fundo ou tipografia.",
    };
  }

  if (FORMAT_CHANGE_PATTERNS.some((pattern) => pattern.test(feedback))) {
    return {
      kind: "redirect",
      message:
        "Esse pedido muda o formato. Use a adaptação de formato para criar uma nova linhagem.",
    };
  }

  if (classifyCreativeFeedback(feedback) === "clarify") {
    await saveCreativeFeedbackDraft(input.scope, feedback);
    return {
      kind: "clarify",
      question:
        "Pode detalhar o que deve mudar no criativo? Ex.: cor de fundo, layout, imagem ou tipografia.",
    };
  }

  const lineageResult = await ensureCreativeLineage(input.scope);
  if ("kind" in lineageResult) {
    return lineageResult;
  }

  const sourceResult = await resolveCreativeRevisionSource(
    input.scope,
    lineageResult.lineageId
  );
  if (sourceResult.kind !== "resolved") {
    return sourceResult;
  }

  const { source } = sourceResult;
  const generate =
    input.generateCreativeRevisionProposal ??
    defaultGenerateCreativeRevisionProposal;
  const modelOutput = await generate(source.sourceSnapshot, feedback);

  const referenceIds = Array.from(
    new Set([...(input.attachmentReferenceIds ?? [])])
  );

  const writes = buildConfirmWrites();

  const payload: Extract<
    ArtifactProposalPayload,
    { type: "creative_revision" }
  > = {
    type: "creative_revision",
    schemaVersion: 1,
    summary: modelOutput.summary,
    intendedChanges: modelOutput.intendedChanges,
    format: modelOutput.format,
    referenceIds,
    creditImpact: CREATIVE_CREDIT_COST,
    writes,
    planVersionId: source.planVersionId,
  };

  const proposal = await createArtifactProposal({
    scope: input.scope,
    lineageId: source.lineageId,
    sourceVersionId: source.sourceVersionId,
    proposalType: "creative_revision",
    payload,
    feedback,
  });

  await clearCreativeFeedbackDraft(input.scope);

  const head = await getArtifactHead(input.scope, source.lineageId);

  const result: CreativeRevisionProposalResult = {
    kind: "proposal",
    proposalId: proposal.id,
    lineageId: source.lineageId,
    sourceVersionId: source.sourceVersionId,
    sourceVersionNumber: source.sourceVersionNumber,
    planVersionId: source.planVersionId,
    planVersionLabel: source.planVersionLabel,
    lineageHeadRevision: head?.revision ?? 0,
    payloadDigest: canonicalProposalPayloadDigest(payload),
    sourceVersionLabel: source.sourceVersionLabel,
    approvedVersionLabel: source.approvedVersionLabel,
    workingDiffersFromApproved: source.workingDiffersFromApproved,
    summary: payload.summary,
    intendedChanges: payload.intendedChanges,
    format: payload.format,
    referenceIds: payload.referenceIds,
    creditImpact: payload.creditImpact,
    writes: payload.writes,
    payload,
  };

  return result;
}

export async function cancelCreativeRevision(scope: ArtifactScope, proposalId: string) {
  return transitionArtifactProposal({
    scope,
    proposalId,
    nextStatus: "canceled",
  });
}

import {
  transitionAssistantAction,
} from "@/server/repositories/assistant-action";
import {
  updateDerivationStatus,
} from "@/server/repositories/derivation";

export async function cancelRunningCreativeRevision(input: {
  scope: ArtifactScope;
  actionId: string;
  derivationId: string;
}): Promise<{ actionStatus: "canceled"; derivationStatus: "canceled" }> {
  const derivationRow = await updateDerivationStatus(
    input.derivationId,
    input.scope.workspaceId,
    "canceled"
  );
  if (!derivationRow) {
    throw new ArtifactVersionValidationError("Derivation not found for cancel");
  }

  const updatedAction = await transitionAssistantAction(
    input.scope.workspaceId,
    input.actionId,
    "canceled",
    {
      safeError: "Geração cancelada pelo usuário.",
    }
  );
  if (!updatedAction) {
    throw new ArtifactVersionValidationError(
      "Action not found for running cancel"
    );
  }

  return {
    actionStatus: "canceled",
    derivationStatus: "canceled",
  };
}

export async function confirmCreativeRevision(input: {
  scope: ArtifactScope;
  proposalId: string;
  lineageId: string;
  sourceVersionId: string;
  payloadDigest: string;
  messageId?: string | null;
  actionId?: string | null;
  lineageHeadRevision?: number;
  hasActiveGeneration?: FindActiveGeneration;
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
  if (proposal.proposalType !== "creative_revision") {
    throw new ArtifactVersionValidationError("Invalid proposal type");
  }

  const payload = proposal.payload;
  if (payload.type !== "creative_revision") {
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

  const checkActive = input.hasActiveGeneration ?? findActiveGenerationForLineage;
  const hasActive = await checkActive(input.scope, input.lineageId);
  if (hasActive) {
    throw new ArtifactVersionValidationError(
      "Já existe uma geração em andamento para este criativo."
    );
  }

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

  return {
    version: null,
    head,
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
