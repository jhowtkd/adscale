import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

import { getOpenAI } from "@/server/ai/utils";
import { env } from "@/server/validation/env";
import { brandTrainingAnalysisSchema, type BrandTrainingAnalysis } from "../brand-training/contracts";
import {
  feedbackEvidence,
  type VisualRepertoire,
  type VisualRule,
} from "../brand-training/visual-repertoire";
import {
  REPERTOIRE_EXTRACTOR_VERSION,
  REPERTOIRE_SYNTHESIS_PROMPT,
  RepertoireSynthesisError,
  synthesizeRepertoire,
  type RepertoireFeedback,
  type RepertoireSource,
  type SynthesizeRepertoireDeps,
} from "../brand-training/synthesize-repertoire";
import { compileRepertoireCandidate } from "../brand-knowledge/candidate-compiler";
import type { BrandKnowledgeClaim } from "../brand-knowledge/contracts";
import { canonicalJsonStringify } from "../creative-work/canonical-json";
import { db } from "../db";
import { clientReferences, workspaceAssets } from "../db/schema";
import { createBrandKnowledgeCandidates } from "../repositories/brand-knowledge";

export class BrandRepertoireError extends Error {
  readonly code: "no_sources" | "unknown_reference" | "unverifiable_source";

  constructor(code: "no_sources" | "unknown_reference" | "unverifiable_source", message?: string) {
    super(message ?? code);
    this.name = "BrandRepertoireError";
    this.code = code;
  }
}

export type AnalyzedTrainingReference = {
  id: string;
  assetKey: string;
  analysis: BrandTrainingAnalysis;
};

/**
 * Render the approved analyses and operator comments for one synthesis model
 * call. A bare dislike stays a preference — only a written note becomes an
 * instruction, and even then it travels as a comment for the next human
 * review, never as a compiled rule.
 */
export function renderRepertoireSynthesisInput(
  sources: readonly RepertoireSource[],
  feedback: readonly RepertoireFeedback[],
): string {
  const lines = ["REFERÊNCIAS APROVADAS (análises individuais):"];
  for (const source of sources) {
    const analysis = source.analysis;
    lines.push([
      `[${source.id}]`,
      analysis.description,
      `atributos: ${analysis.visualAttributes.join("; ") || "(nenhum)"}`,
      `regras: ${analysis.rules.join("; ") || "(nenhuma)"}`,
      `restrições: ${analysis.constraints.join("; ") || "(nenhuma)"}`,
      ...(analysis.compositionalRelations ?? []).map(
        (relation) =>
          `relação(${relation.dimension}): viu "${relation.observation}" → aplicar "${relation.application}"`,
      ),
    ].join(" | "));
  }
  if (feedback.length > 0) {
    lines.push(
      "COMENTÁRIOS DO OPERADOR SOBRE EXEMPLOS (uma rejeição sem nota é só preferência, nunca regra):",
    );
    for (const entry of feedback) {
      const evidence = feedbackEvidence({ rating: entry.rating, note: entry.note });
      lines.push(
        `[${entry.outputId}] ${evidence.preference}${evidence.instruction ? `: ${evidence.instruction}` : " (sem comentário)"}`,
      );
    }
  }
  lines.push("Responda apenas com JSON { common, languages }; cite só evidenceIds desta lista.");
  return lines.join("\n");
}

function stripRepertoireIds(repertoire: VisualRepertoire): unknown {
  const stripRule = (rule: VisualRule) => ({
    dimension: rule.dimension,
    observation: rule.observation,
    application: rule.application,
    avoid: rule.avoid,
    evidenceIds: [...rule.evidenceIds],
    confidence: rule.confidence,
  });
  return {
    common: repertoire.common.map(stripRule),
    languages: repertoire.languages.map((language) => ({
      name: language.name,
      contexts: [...language.contexts],
      rules: language.rules.map(stripRule),
    })),
  };
}

async function callRepertoireModel(system: string, user: string): Promise<unknown> {
  const response = await getOpenAI().chat.completions.create({
    model: env.OPENAI_TEXT_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
  });
  const content = response.choices[0]?.message?.content;
  // No JSON-repair loop: invalid output is a recoverable error the review
  // surfaces, never a silent retry.
  if (!content) {
    throw new RepertoireSynthesisError("empty_repertoire_proposal", { recoverable: true });
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new RepertoireSynthesisError("invalid_repertoire_proposal", { recoverable: true });
  }
}

async function defaultProposeGroup(input: {
  sources: RepertoireSource[];
  feedback: RepertoireFeedback[];
}): Promise<unknown> {
  return callRepertoireModel(
    REPERTOIRE_SYNTHESIS_PROMPT,
    renderRepertoireSynthesisInput(input.sources, input.feedback),
  );
}

async function defaultConsolidate(input: { merged: VisualRepertoire }): Promise<unknown> {
  return callRepertoireModel(
    `${REPERTOIRE_SYNTHESIS_PROMPT}\nConsolide os repertórios parciais abaixo em um único JSON { common, languages }. Não inclua ids.`,
    canonicalJsonStringify(stripRepertoireIds(input.merged)),
  );
}

async function defaultListAnalyzedReferences(input: {
  workspaceId: string;
  profileId: string;
}): Promise<AnalyzedTrainingReference[]> {
  const rows = await db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, input.workspaceId),
        eq(clientReferences.clientProfileId, input.profileId),
        eq(clientReferences.reviewStatus, "approved"),
      ),
    );
  const analyzed: AnalyzedTrainingReference[] = [];
  for (const row of rows) {
    const parsed = brandTrainingAnalysisSchema.safeParse(row.trainingAnalysis);
    if (!parsed.success) continue;
    analyzed.push({ id: row.id, assetKey: row.assetKey, analysis: parsed.data });
  }
  return analyzed;
}

async function defaultResolveAssetHashes(input: {
  workspaceId: string;
  assetKeys: readonly string[];
}): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  if (input.assetKeys.length === 0) return hashes;
  const rows = await db
    .select()
    .from(workspaceAssets)
    .where(
      and(
        eq(workspaceAssets.workspaceId, input.workspaceId),
        inArray(workspaceAssets.key, [...input.assetKeys]),
      ),
    );
  for (const row of rows) {
    const sha = (row.metadata as { sha256?: unknown } | null)?.sha256;
    if (typeof sha === "string" && /^[0-9a-f]{64}$/.test(sha)) {
      hashes.set(row.key, sha);
    }
  }
  return hashes;
}

export type SynthesizeBrandRepertoireDeps = {
  listAnalyzedReferences?: (input: {
    workspaceId: string;
    profileId: string;
  }) => Promise<AnalyzedTrainingReference[]>;
  resolveAssetHashes?: (input: {
    workspaceId: string;
    assetKeys: readonly string[];
  }) => Promise<Map<string, string>>;
  proposeGroup?: SynthesizeRepertoireDeps["proposeGroup"];
  consolidate?: SynthesizeRepertoireDeps["consolidate"];
  persistCandidates?: (
    claims: Parameters<typeof createBrandKnowledgeCandidates>[2],
  ) => Promise<BrandKnowledgeClaim[]>;
};

/**
 * Synthesize the visual repertoire on review request (plan 02, T2) — the
 * production caller of `synthesizeRepertoire`. Runs over the approved,
 * analyzed training references (or an explicit subset), compiles the proposal
 * as a `visual.repertoire` candidate claim and persists it for operator
 * review. Nothing is approved here: approval is the atomic `review_repertoire`
 * command.
 */
export async function synthesizeBrandRepertoire(
  input: {
    workspaceId: string;
    profileId: string;
    referenceIds?: string[];
    feedback?: RepertoireFeedback[];
  },
  deps: SynthesizeBrandRepertoireDeps = {},
): Promise<{ claim: BrandKnowledgeClaim | null; repertoire: VisualRepertoire }> {
  const listAnalyzed = deps.listAnalyzedReferences ?? defaultListAnalyzedReferences;
  const analyzed = await listAnalyzed({ workspaceId: input.workspaceId, profileId: input.profileId });
  const wanted = input.referenceIds ? [...new Set(input.referenceIds)] : null;
  if (wanted) {
    const known = new Set(analyzed.map((reference) => reference.id));
    const unknown = wanted.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new BrandRepertoireError(
        "unknown_reference",
        `References are not approved and analyzed: ${unknown.join(", ")}`,
      );
    }
  }
  const picked = wanted ? analyzed.filter((reference) => wanted.includes(reference.id)) : analyzed;
  if (picked.length === 0) {
    throw new BrandRepertoireError("no_sources", "No approved analyzed references to synthesize");
  }
  const resolveHashes = deps.resolveAssetHashes ?? defaultResolveAssetHashes;
  const hashes = await resolveHashes({
    workspaceId: input.workspaceId,
    assetKeys: [...new Set(picked.map((reference) => reference.assetKey))],
  });
  const sources: RepertoireSource[] = picked.map((reference) => {
    const hash = hashes.get(reference.assetKey);
    if (!hash) {
      throw new BrandRepertoireError(
        "unverifiable_source",
        `Reference ${reference.id} has no verifiable asset hash`,
      );
    }
    return { id: reference.id, hash, analysis: reference.analysis };
  });
  const repertoire = await synthesizeRepertoire(
    {
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      referenceIds: sources.map((source) => source.id),
      feedback: input.feedback ?? [],
    },
    {
      listSources: async () => sources,
      proposeGroup: deps.proposeGroup ?? defaultProposeGroup,
      consolidate: deps.consolidate ?? defaultConsolidate,
    },
  );
  // Claim evidence refs cap at 20: record the deterministic first 20 by id.
  // Rule-level evidenceIds keep the full provenance; the claim sourceHash
  // below still covers every source hash.
  const evidenceSources = [...sources]
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, 20);
  const evidence = evidenceSources.map((source) => ({
    type: "training_asset" as const,
    id: source.id,
    path: "repertoire.synthesis",
    sourceHash: source.hash,
  }));
  const sourceHash = createHash("sha256")
    .update(canonicalJsonStringify({
      hashes: sources.map((source) => source.hash).sort(),
      extractorVersion: REPERTOIRE_EXTRACTOR_VERSION,
    }))
    .digest("hex");
  const candidate = compileRepertoireCandidate({
    repertoire,
    evidence,
    sourceHash,
    confidence: "medium",
  });
  const persist = deps.persistCandidates ??
    ((claims) => createBrandKnowledgeCandidates(input.workspaceId, input.profileId, claims));
  const claims = await persist([candidate]);
  // Idempotent by (claimKey, sourceHash): a repeated synthesis of the same
  // sources finds the existing candidate instead of duplicating it.
  const claim = claims.find(
    (entry) => entry.claimKey === "visual.repertoire" && entry.sourceHash === sourceHash,
  ) ?? null;
  return { claim, repertoire };
}
