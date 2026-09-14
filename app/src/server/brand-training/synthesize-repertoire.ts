import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { canonicalJsonStringify } from "../creative-work/canonical-json";
import type { BrandTrainingAnalysis } from "./contracts";
import {
  validateRepertoireEvidence,
  VISUAL_RULE_DIMENSIONS,
  type VisualLanguage,
  type VisualRepertoire,
  type VisualRule,
} from "./visual-repertoire";

export const REPERTOIRE_EXTRACTOR_VERSION = "visual-repertoire-v1";
export const REPERTOIRE_GROUP_SIZE = 8;
export const REPERTOIRE_MAX_GROUPS = 6;
export const REPERTOIRE_MAX_SOURCES = REPERTOIRE_GROUP_SIZE * REPERTOIRE_MAX_GROUPS;

export type RepertoireSource = {
  id: string;
  hash: string;
  analysis: BrandTrainingAnalysis;
};

export type RepertoireFeedback = {
  outputId: string;
  rating: "good" | "bad";
  note: string;
};

export class RepertoireSynthesisError extends Error {
  readonly recoverable: boolean;

  constructor(message: string, options: { recoverable: boolean }) {
    super(message);
    this.name = "RepertoireSynthesisError";
    this.recoverable = options.recoverable;
  }
}

export class RepertoireSelectionRequiredError extends RepertoireSynthesisError {
  constructor(sourceCount: number) {
    super(`too_many_repertoire_sources:${sourceCount}`, { recoverable: true });
    this.name = "RepertoireSelectionRequiredError";
  }
}

export type SynthesizeRepertoireDeps = {
  listSources: (input: {
    workspaceId: string;
    profileId: string;
    referenceIds: readonly string[];
  }) => Promise<RepertoireSource[]>;
  /** One model call per group. No JSON-repair loop: invalid output is a recoverable error. */
  proposeGroup: (input: {
    sources: RepertoireSource[];
    feedback: RepertoireFeedback[];
  }) => Promise<unknown>;
  /** Single textual consolidation across groups; skipped for one group. */
  consolidate?: (input: { merged: VisualRepertoire }) => Promise<unknown>;
  cache?: Map<string, VisualRepertoire>;
  randomId?: () => string;
};

const proposedRuleSchema = z
  .object({
    dimension: z.enum(VISUAL_RULE_DIMENSIONS),
    observation: z.string().trim().min(1).max(600),
    application: z.string().trim().min(1).max(600),
    avoid: z.string().trim().max(600).default(""),
    evidenceIds: z.array(z.string().min(1)).min(1).max(12),
    confidence: z.enum(["low", "medium", "high"]),
  })
  .strict();

const proposedLanguageSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    contexts: z.array(z.string().trim().min(1).max(100)).min(1).max(8),
    rules: z.array(proposedRuleSchema).max(20),
  })
  .strict();

const proposedRepertoireSchema = z
  .object({
    common: z.array(proposedRuleSchema).max(20),
    languages: z.array(proposedLanguageSchema).max(12),
  })
  .strict();

type ProposedRepertoire = z.infer<typeof proposedRepertoireSchema>;

export const REPERTOIRE_SYNTHESIS_PROMPT = [
  "Separe a identidade visual comum dos contextos de uso (linguagens).",
  "Escreva invariantes e liberdades de composição; cite evidenceIds de referências do lote.",
  "Aponte dúvidas e possíveis defeitos residuais; não trate defeito como regra.",
  "Não torne um estilo passageiro (neon, colagem) universal sem recorrência.",
  "Responda apenas com JSON { common, languages }; IDs são atribuídos pelo servidor.",
].join("\n");

export function repertoireCacheKey(input: {
  sourceHashes: readonly string[];
  extractorVersion: string;
  feedback: RepertoireFeedback[];
}): string {
  return createHash("sha256")
    .update(canonicalJsonStringify({
      hashes: [...input.sourceHashes].sort(),
      extractorVersion: input.extractorVersion,
      feedback: input.feedback,
    }))
    .digest("hex");
}

function withServerIds(proposed: ProposedRepertoire, randomId: () => string): VisualRepertoire {
  const rule = (entry: ProposedRepertoire["common"][number]): VisualRule => ({
    ...entry,
    // Um padrão com uma única evidência é hipótese, nunca recorrência.
    confidence: entry.evidenceIds.length < 2 ? "low" : entry.confidence,
    id: randomId(),
  });
  const language = (entry: ProposedRepertoire["languages"][number]): VisualLanguage => ({
    id: randomId(),
    name: entry.name,
    contexts: entry.contexts,
    rules: entry.rules.map(rule),
  });
  return { version: 1, common: proposed.common.map(rule), languages: proposed.languages.map(language) };
}

function parseProposal(raw: unknown): ProposedRepertoire {
  const parsed = proposedRepertoireSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RepertoireSynthesisError("invalid_repertoire_proposal", { recoverable: true });
  }
  return parsed.data;
}

export async function synthesizeRepertoire(
  input: {
    workspaceId: string;
    profileId: string;
    referenceIds: string[];
    feedback: RepertoireFeedback[];
  },
  deps: SynthesizeRepertoireDeps,
): Promise<VisualRepertoire> {
  const randomId = deps.randomId ?? randomUUID;
  const listed = await deps.listSources({
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    referenceIds: input.referenceIds,
  });
  // Deterministic: order by id, dedupe by content hash.
  const seen = new Set<string>();
  const sources = [...listed]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((source) => {
      if (seen.has(source.hash)) return false;
      seen.add(source.hash);
      return true;
    });
  if (sources.length > REPERTOIRE_MAX_SOURCES) {
    throw new RepertoireSelectionRequiredError(sources.length);
  }
  const cacheKey = repertoireCacheKey({
    sourceHashes: sources.map((source) => source.hash),
    extractorVersion: REPERTOIRE_EXTRACTOR_VERSION,
    feedback: input.feedback,
  });
  const cached = deps.cache?.get(cacheKey);
  if (cached) return cached;

  const groups: RepertoireSource[][] = [];
  for (let index = 0; index < sources.length; index += REPERTOIRE_GROUP_SIZE) {
    groups.push(sources.slice(index, index + REPERTOIRE_GROUP_SIZE));
  }
  const partials = await Promise.all(
    groups.map(async (group) => withServerIds(parseProposal(
      await deps.proposeGroup({ sources: group, feedback: input.feedback }),
    ), randomId)),
  );
  const merged: VisualRepertoire = {
    version: 1,
    common: partials.flatMap((part) => part.common),
    languages: partials.flatMap((part) => part.languages),
  };
  const finalRepertoire = partials.length > 1 && deps.consolidate
    ? withServerIds(parseProposal(await deps.consolidate({ merged })), randomId)
    : merged;
  validateRepertoireEvidence(finalRepertoire, new Set(sources.map((source) => source.id)));
  deps.cache?.set(cacheKey, finalRepertoire);
  return finalRepertoire;
}
