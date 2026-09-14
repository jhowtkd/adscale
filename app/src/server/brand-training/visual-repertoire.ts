import { z } from "zod";

import type { CreativeWorkVisualDirection } from "../creative-work/contracts";

export const VISUAL_RULE_DIMENSIONS = [
  "composition",
  "hierarchy",
  "typography",
  "imagery",
  "finish",
  "motif",
  "human_presence",
] as const;
export type VisualRuleDimension = (typeof VISUAL_RULE_DIMENSIONS)[number];

export type VisualRule = {
  id: string;
  dimension: VisualRuleDimension;
  observation: string;
  application: string;
  avoid: string;
  evidenceIds: string[];
  confidence: "low" | "medium" | "high";
};

export type VisualLanguage = {
  id: string;
  name: string;
  contexts: string[];
  rules: VisualRule[];
};

export type VisualRepertoire = {
  version: 1;
  common: VisualRule[];
  languages: VisualLanguage[];
};

export const visualRuleSchema = z
  .object({
    id: z.string().uuid(),
    dimension: z.enum(VISUAL_RULE_DIMENSIONS),
    observation: z.string().trim().min(1).max(600),
    application: z.string().trim().min(1).max(600),
    avoid: z.string().trim().max(600),
    evidenceIds: z.array(z.string().min(1)).min(1).max(12),
    confidence: z.enum(["low", "medium", "high"]),
  })
  .strict();

export const visualLanguageSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    contexts: z.array(z.string().trim().min(1).max(100)).min(1).max(8),
    rules: z.array(visualRuleSchema).max(20),
  })
  .strict();

export const visualRepertoireSchema = z
  .object({
    version: z.literal(1),
    common: z.array(visualRuleSchema).max(20),
    languages: z.array(visualLanguageSchema).max(12),
  })
  .strict();

export function validateRepertoireEvidence(value: VisualRepertoire, sources: ReadonlySet<string>) {
  const rules = [...value.common, ...value.languages.flatMap((l) => l.rules)];
  for (const rule of rules) {
    if (!rule.evidenceIds.length || rule.evidenceIds.some((id) => !sources.has(id))) {
      throw new Error("unknown_repertoire_evidence");
    }
  }
}

export function feedbackEvidence(feedback: { rating: "good" | "bad"; note: string }) {
  return { preference: feedback.rating, instruction: feedback.note.trim() || null };
}

export function normalizeVisualName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("pt-BR");
}

export type ResolvedVisualLanguage =
  | { kind: "resolved"; language: VisualLanguage | null }
  | { kind: "ambiguous"; ids: string[] }
  | { kind: "missing" };

export function resolveVisualLanguage(input: {
  repertoire: VisualRepertoire;
  explicitId: string | null;
  mentionedName: string | null;
  context: string | null;
}): ResolvedVisualLanguage {
  const languages = input.repertoire.languages;
  if (input.explicitId !== null) {
    const match = languages.find((language) => language.id === input.explicitId);
    return match ? { kind: "resolved", language: match } : { kind: "missing" };
  }
  if (input.mentionedName !== null) {
    const wanted = normalizeVisualName(input.mentionedName);
    const matches = languages.filter((language) => normalizeVisualName(language.name) === wanted);
    if (matches.length === 0) return { kind: "missing" };
    if (matches.length > 1) return { kind: "ambiguous", ids: matches.map((language) => language.id) };
    return { kind: "resolved", language: matches[0]! };
  }
  if (input.context !== null) {
    const wanted = normalizeVisualName(input.context);
    const matches = languages.filter((language) =>
      language.contexts.some((entry) => normalizeVisualName(entry) === wanted),
    );
    if (matches.length === 0) return { kind: "resolved", language: null };
    if (matches.length > 1) return { kind: "ambiguous", ids: matches.map((language) => language.id) };
    return { kind: "resolved", language: matches[0]! };
  }
  return { kind: "resolved", language: null };
}

export type VisualLanguageOption = { id: string; name: string };

export type WorkVisualLanguageError =
  | { code: "visual_language_unknown"; visualLanguageId: string; options: VisualLanguageOption[] }
  | { code: "visual_language_ambiguous"; name: string; options: VisualLanguageOption[] };

export type WorkVisualLanguageResolution =
  | { ok: true; language: VisualLanguage | null }
  | { ok: false; error: WorkVisualLanguageError };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Word-boundary match on normalized text; multi-word names supported. */
function mentionsLanguageName(text: string, name: string): boolean {
  const wanted = normalizeVisualName(name);
  if (!wanted) return false;
  const boundary = "[\\p{L}\\p{Nd}_\\p{M}]";
  return new RegExp(
    `(?<!${boundary})${escapeRegExp(wanted)}(?!${boundary})`,
    "iu",
  ).test(text.normalize("NFKC"));
}

/**
 * Resolve the briefing's visual language against the frozen repertoire
 * (plan 02, T3). Explicit IDs win over names; an unknown explicit id and an
 * ambiguous name block preparation with a clarification payload. An unknown
 * NAME never blocks and never creates a language — the piece falls back to
 * the common identity. Shared by the single-piece and carousel prepare paths.
 */
export function resolveWorkVisualLanguage(input: {
  repertoire: VisualRepertoire | null;
  explicitId?: string | null;
  text: string;
}): WorkVisualLanguageResolution {
  const repertoire = input.repertoire;
  const explicitId = input.explicitId ?? null;
  const options: VisualLanguageOption[] = (repertoire?.languages ?? [])
    .map((language) => ({ id: language.id, name: language.name }));
  if (!repertoire || repertoire.languages.length === 0) {
    if (explicitId) {
      return { ok: false, error: { code: "visual_language_unknown", visualLanguageId: explicitId, options } };
    }
    return { ok: true, language: null };
  }
  if (explicitId) {
    const resolved = resolveVisualLanguage({
      repertoire,
      explicitId,
      mentionedName: null,
      context: null,
    });
    if (resolved.kind === "missing") {
      return { ok: false, error: { code: "visual_language_unknown", visualLanguageId: explicitId, options } };
    }
    // Exact ids never resolve ambiguously; the missing branch above is the
    // only failure mode here.
    if (resolved.kind === "ambiguous") {
      return {
        ok: false,
        error: {
          code: "visual_language_ambiguous",
          name: explicitId,
          options: options.filter((option) => resolved.ids.includes(option.id)),
        },
      };
    }
    return { ok: true, language: resolved.language };
  }
  const normalizedText = input.text.normalize("NFKC").toLocaleLowerCase("pt-BR");
  for (const language of repertoire.languages) {
    if (!mentionsLanguageName(normalizedText, language.name)) continue;
    const resolved = resolveVisualLanguage({
      repertoire,
      explicitId: null,
      mentionedName: language.name,
      context: null,
    });
    if (resolved.kind === "ambiguous") {
      return {
        ok: false,
        error: {
          code: "visual_language_ambiguous",
          name: language.name,
          options: options.filter((option) => resolved.ids.includes(option.id)),
        },
      };
    }
    if (resolved.kind === "missing") continue;
    return { ok: true, language: resolved.language };
  }
  return { ok: true, language: null };
}

const joinApplications = (rules: readonly VisualRule[]): string =>
  rules.map((rule) => rule.application.trim()).filter(Boolean).join("; ");

const sliceText = (value: string, limit: number): string => value.slice(0, limit);

/**
 * Compose the frozen visual direction from the resolved language (plan 02,
 * T3). Deterministic and provider-free: the common identity always applies,
 * the language specializes it, and common prohibitions are preserved verbatim
 * — a language never overrides an approved `avoid`. Returns null when no rule
 * applies, so works without repertoire knowledge keep legacy snapshots.
 */
export function composeVisualDirection(input: {
  repertoire: VisualRepertoire;
  language: VisualLanguage | null;
}): CreativeWorkVisualDirection | null {
  const common = input.repertoire.common;
  const specialized = input.language?.rules ?? [];
  const applicable = [...common, ...specialized];
  if (applicable.length === 0) return null;
  const ruleIds = [...new Set(applicable.map((rule) => rule.id))].slice(0, 30);
  const byDimension = (dimension: VisualRule["dimension"]) =>
    applicable.filter((rule) => rule.dimension === dimension);
  const dominant =
    joinApplications([...byDimension("hierarchy"), ...byDimension("composition")]) ||
    joinApplications(applicable);
  const composition =
    joinApplications([...byDimension("composition"), ...byDimension("hierarchy")]) ||
    joinApplications(applicable);
  const typography =
    joinApplications(byDimension("typography")) ||
    "Seguir a tipografia aprovada da marca.";
  const finish =
    joinApplications(byDimension("finish")) ||
    "Aplicar o acabamento padrão da marca.";
  const preserve = [...new Set(
    common.map((rule) => rule.avoid.trim()).filter(Boolean),
  )].map((avoid) => sliceText(avoid, 240)).slice(0, 10);
  return {
    languageId: input.language?.id ?? null,
    ruleIds,
    dominantIdea: sliceText(dominant, 1000),
    composition: sliceText(composition, 1000),
    typography: sliceText(typography, 1000),
    finish: sliceText(finish, 1000),
    preserve,
  };
}

/** Applicable `motif` rule applications feeding the carousel visual contract. */
export function repertoireMotifs(input: {
  repertoire: VisualRepertoire;
  language: VisualLanguage | null;
}): string[] {
  return [...input.repertoire.common, ...(input.language?.rules ?? [])]
    .filter((rule) => rule.dimension === "motif")
    .map((rule) => rule.application.trim())
    .filter(Boolean);
}
