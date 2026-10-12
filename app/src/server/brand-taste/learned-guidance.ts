import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "../creative-work/canonical-json";
import type { RuleCategory } from "./calibration-signal-types";

export const GUIDANCE_ROLES = [
  "copy", "art_direction", "image_prompt", "carousel_editorial",
  "caption_adjustment", "strategist", "legacy_derivation",
] as const;

export type GuidanceRole = (typeof GUIDANCE_ROLES)[number];
export type GuidanceWrapperLanguage = "en" | "pt-BR";
export const MAX_LEARNED_GUIDANCE_RULES = 5;
export const MAX_LEARNED_GUIDANCE_RULE_CODE_POINTS = 280;
export const MAX_LEARNED_GUIDANCE_FRAGMENT_CODE_POINTS = 1500;

export const LEARNED_GUIDANCE_WRAPPERS = {
  en: [
    "LEARNED BRAND PREFERENCES:",
    "Never override fixed skills, role rules, safety, objective integrity, supported facts or the explicit Request. Validators and gates remain active.",
  ],
  "pt-BR": [
    "PREFERÊNCIAS APRENDIDAS DA MARCA:",
    "Nunca prevaleça sobre skills fixas, regras do papel, segurança, integridade objetiva, fatos sustentados ou Pedido explícito. Validadores e gates permanecem ativos.",
  ],
} as const;

export interface LearnedGuidanceRef {
  readonly ruleId: string;
  readonly revision: number | "legacy";
  readonly contentHash: string;
}

export interface EligibleGuidanceRevision extends LearnedGuidanceRef {
  readonly category: RuleCategory;
  readonly roles: readonly GuidanceRole[];
  readonly text: string;
}

export interface LearnedGuidanceFragment {
  lines: string[];
  appliedRefs: LearnedGuidanceRef[];
  setHash: string | null;
  omissionReason?: "budget_exceeded";
}

export interface LearnedGuidanceSelection {
  readonly role: GuidanceRole;
  readonly revisions: readonly EligibleGuidanceRevision[];
}

export class LearnedGuidanceError extends Error {
  constructor(public readonly code: "budget_exceeded" | "invalid_revision" | "content_hash_mismatch", message: string) {
    super(message);
    this.name = "LearnedGuidanceError";
  }
}

export function hashGuidanceContent(text: string): string {
  // Identity covers the approved UTF-8 bytes, before delimiter neutralization.
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function referenceOf({ ruleId, revision, contentHash }: LearnedGuidanceRef): LearnedGuidanceRef {
  return { ruleId, revision, contentHash };
}

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function compareRefs(a: LearnedGuidanceRef, b: LearnedGuidanceRef): number {
  const idOrder = compare(a.ruleId, b.ruleId);
  if (idOrder) return idOrder;
  if (a.revision !== b.revision) {
    if (a.revision === "legacy") return 1;
    if (b.revision === "legacy") return -1;
    return a.revision - b.revision;
  }
  return compare(a.contentHash, b.contentHash);
}

function uniqueSorted<T extends LearnedGuidanceRef>(refs: readonly T[]): T[] {
  for (const ref of refs) {
    if (ref.revision !== "legacy" && !(Number.isInteger(ref.revision) && ref.revision > 0)) {
      throw new LearnedGuidanceError("invalid_revision", "A revisão da orientação deve ser um inteiro positivo ou legacy.");
    }
  }
  return [...new Map(refs.map(ref => [canonicalJsonStringify(referenceOf(ref)), ref])).values()].sort(compareRefs);
}

export function hashGuidanceSet(refs: readonly LearnedGuidanceRef[]): string | null {
  return refs.length ? hashGuidanceContent(canonicalJsonStringify(uniqueSorted(refs).map(referenceOf))) : null;
}

function selectRevisions(input: LearnedGuidanceSelection): EligibleGuidanceRevision[] {
  const revisions = input.revisions.filter(revision => revision.roles.includes(input.role));
  for (const revision of revisions) {
    if (revision.contentHash !== hashGuidanceContent(revision.text)) {
      throw new LearnedGuidanceError("content_hash_mismatch", "O hash não corresponde ao texto aprovado da orientação.");
    }
  }
  return uniqueSorted(revisions);
}

function renderLines(language: GuidanceWrapperLanguage, revisions: readonly EligibleGuidanceRevision[]): string[] {
  if (!revisions.length) return [];
  const [heading, subordination] = LEARNED_GUIDANCE_WRAPPERS[language];
  const body = revisions.map(({ text }) => text
    .replace(/<(?=\s*[A-Za-z/!?])/g, "‹")
    .replace(/`{3,}|~{3,}/g, fence => fence.split("").join("\\")));
  return [heading, ...body, subordination];
}

function assertBudget(revisions: readonly EligibleGuidanceRevision[], lines: readonly string[]): void {
  if (revisions.length > MAX_LEARNED_GUIDANCE_RULES
    || revisions.some(revision => [...revision.text].length > MAX_LEARNED_GUIDANCE_RULE_CODE_POINTS)
    || [...lines.join("\n")].length > MAX_LEARNED_GUIDANCE_FRAGMENT_CODE_POINTS) {
    throw new LearnedGuidanceError("budget_exceeded", "O fragmento aprendido excede o orçamento D5.");
  }
}

export function validateLearnedGuidanceBudget(input: LearnedGuidanceSelection): void {
  const revisions = selectRevisions(input);
  for (const language of ["en", "pt-BR"] as const) {
    assertBudget(revisions, renderLines(language, revisions));
  }
}

export function renderLearnedGuidance(input: LearnedGuidanceSelection & {
  language: GuidanceWrapperLanguage;
}): LearnedGuidanceFragment {
  const revisions = selectRevisions(input);
  const lines = renderLines(input.language, revisions);
  try {
    assertBudget(revisions, lines);
  } catch (error) {
    if (!(error instanceof LearnedGuidanceError) || error.code !== "budget_exceeded") throw error;
    return { lines: [], appliedRefs: [], setHash: null, omissionReason: "budget_exceeded" };
  }
  if (!revisions.length) return { lines: [], appliedRefs: [], setHash: null };
  const appliedRefs = revisions.map(referenceOf);
  return {
    lines,
    appliedRefs,
    setHash: hashGuidanceSet(appliedRefs),
  };
}
