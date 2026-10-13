import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "../creative-work/canonical-json";
import { TAG_OPEN, neutralizeUntrusted } from "../prompt-delimiters";
import type { RuleCategory } from "./calibration-signal-types";

export const GUIDANCE_ROLES = [
  "copy", "art_direction", "image_prompt", "carousel_editorial",
  "caption_adjustment", "strategist", "legacy_derivation",
] as const;

export type GuidanceRole = (typeof GUIDANCE_ROLES)[number];
export type GuidanceWrapperLanguage = "en" | "pt-BR";
export function isGuidanceRole(value: unknown): value is GuidanceRole {
  return typeof value === "string" && GUIDANCE_ROLES.includes(value as GuidanceRole);
}
const neutralizeTags = (text: string) => text.replace(TAG_OPEN, "‹");
// shortcut: roles without a native neutralizer reuse TAG_OPEN; replace when that consumer defines its own.
const NEUTRALIZE_BY_ROLE: Record<GuidanceRole, (text: string) => string> = {
  copy: neutralizeTags,
  art_direction: neutralizeTags,
  image_prompt: neutralizeTags,
  carousel_editorial: neutralizeUntrusted,
  caption_adjustment: neutralizeTags,
  strategist: neutralizeTags,
  legacy_derivation: neutralizeTags,
};
const CATEGORIES_BY_ROLE: Partial<Record<GuidanceRole, readonly RuleCategory[]>> = {
  copy: ["voice", "invite", "brand_nuance"],
  art_direction: ["figure", "gestalt", "hierarchy", "brand_nuance"],
  image_prompt: ["figure", "gestalt", "hierarchy", "brand_nuance"],
  carousel_editorial: ["voice", "invite", "brand_nuance"],
  caption_adjustment: ["voice", "brand_nuance"],
  strategist: ["voice", "invite", "brand_nuance"],
};
export function isGuidanceCategoryApplicable(role: GuidanceRole, category: RuleCategory): boolean {
  const categories = CATEGORIES_BY_ROLE[role];
  return role === "legacy_derivation" || (category !== "export_conflict"
    && (category === "corpus_quality" || !categories || categories.includes(category)));
}
export const MAX_LEARNED_GUIDANCE_RULES = 5;
export const MAX_LEARNED_GUIDANCE_RULE_CODE_POINTS = 280;
export const MAX_LEARNED_GUIDANCE_FRAGMENT_CODE_POINTS = 1500;
export const LEARNED_GUIDANCE_LINE_SEPARATOR = "\n";

export const LEARNED_GUIDANCE_WRAPPERS = {
  en: [
    "LEARNED BRAND PREFERENCES:",
    "These preferences never override fixed skills, role rules, safety, objective integrity, supported facts or the explicit Request. Validators and gates remain active.",
  ],
  "pt-BR": [
    "PREFERÊNCIAS APRENDIDAS DA MARCA:",
    "Estas preferências nunca prevalecem sobre skills fixas, regras do papel, segurança, integridade objetiva, fatos sustentados ou o Pedido explícito. Validadores e gates permanecem ativos.",
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
  /** Join with LEARNED_GUIDANCE_LINE_SEPARATOR and insert as one section so the measured budget is preserved. */
  lines: string[];
  appliedRefs: LearnedGuidanceRef[];
  setHash: string | null;
  omissionReason?: "budget_exceeded" | "invalid_guidance";
}

export interface LearnedGuidanceSelection {
  readonly role: GuidanceRole;
  readonly revisions: readonly EligibleGuidanceRevision[];
}

export class LearnedGuidanceError extends Error {
  constructor(public readonly code: "budget_exceeded" | "invalid_revision" | "content_hash_mismatch" | "invalid_guidance", message: string) {
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
  if (!isGuidanceRole(input.role) || !Array.isArray(input.revisions)
    || input.revisions.some(revision => !revision || typeof revision !== "object"
      || !Array.isArray(revision.roles) || !revision.roles.every(isGuidanceRole))) {
    throw new LearnedGuidanceError("invalid_guidance", "A orientação deve confirmar somente papéis de destino válidos.");
  }
  if (input.revisions.some(revision => typeof revision.text !== "string" || !revision.text.trim()
    || /[\r\n\v\f\u0085\u2028\u2029]/.test(revision.text))) {
    throw new LearnedGuidanceError("invalid_guidance", "O texto aprovado deve ser preenchido e ocupar uma única linha.");
  }
  const refs = uniqueSorted(input.revisions.map(referenceOf));
  if (new Set(refs.map(ref => ref.ruleId)).size !== refs.length) {
    throw new LearnedGuidanceError("invalid_revision", "Cada regra deve ter uma única revisão e um único texto no conjunto.");
  }
  for (const revision of input.revisions) {
    if (revision.contentHash !== hashGuidanceContent(revision.text)) {
      throw new LearnedGuidanceError("content_hash_mismatch", "O hash não corresponde ao texto aprovado da orientação.");
    }
  }
  // #672 preserves legacy categories, including export_conflict; only new roles use this category filter.
  return uniqueSorted(input.revisions.filter(revision => revision.roles.includes(input.role)
    && isGuidanceCategoryApplicable(input.role, revision.category)));
}

function renderLines(role: GuidanceRole, language: GuidanceWrapperLanguage, revisions: readonly EligibleGuidanceRevision[]): string[] {
  if (!revisions.length) return [];
  const [heading, subordination] = LEARNED_GUIDANCE_WRAPPERS[language];
  const body = revisions.map(({ text }) => NEUTRALIZE_BY_ROLE[role](text));
  if (body.some(text => !text.trim())) {
    throw new LearnedGuidanceError("invalid_guidance", "A orientação deve manter texto após a neutralização dos delimitadores.");
  }
  return [heading, ...body, subordination];
}

function assertBudget(input: LearnedGuidanceSelection, language: GuidanceWrapperLanguage, revisions: readonly EligibleGuidanceRevision[], lines: readonly string[]): void {
  const context = `para o papel ${input.role} no idioma ${language}.`;
  if (revisions.length > MAX_LEARNED_GUIDANCE_RULES) {
    throw new LearnedGuidanceError("budget_exceeded", `O fragmento excede o limite de ${MAX_LEARNED_GUIDANCE_RULES} regras ${context}`);
  }
  if (input.revisions.some(revision => [...revision.text].length > MAX_LEARNED_GUIDANCE_RULE_CODE_POINTS)) {
    throw new LearnedGuidanceError("budget_exceeded", `A orientação excede o limite de ${MAX_LEARNED_GUIDANCE_RULE_CODE_POINTS} caracteres por regra ${context}`);
  }
  if ([...lines.join(LEARNED_GUIDANCE_LINE_SEPARATOR)].length > MAX_LEARNED_GUIDANCE_FRAGMENT_CODE_POINTS) {
    throw new LearnedGuidanceError("budget_exceeded", `O fragmento excede o limite de ${MAX_LEARNED_GUIDANCE_FRAGMENT_CODE_POINTS} caracteres ${context}`);
  }
}

export function validateLearnedGuidanceBudget(input: LearnedGuidanceSelection): void {
  const revisions = selectRevisions(input);
  for (const language of ["en", "pt-BR"] as const) {
    assertBudget(input, language, revisions, renderLines(input.role, language, revisions));
  }
}

export function renderLearnedGuidance(input: LearnedGuidanceSelection & {
  language: GuidanceWrapperLanguage;
}): LearnedGuidanceFragment {
  try {
    const revisions = selectRevisions(input);
    const lines = renderLines(input.role, input.language, revisions);
    assertBudget(input, input.language, revisions, lines);
    if (!revisions.length) return { lines: [], appliedRefs: [], setHash: null };
    const appliedRefs = revisions.map(referenceOf);
    return { lines, appliedRefs, setHash: hashGuidanceSet(appliedRefs) };
  } catch (error) {
    if (!(error instanceof LearnedGuidanceError)) throw error;
    return {
      lines: [], appliedRefs: [], setHash: null,
      omissionReason: error.code === "budget_exceeded" ? "budget_exceeded" : "invalid_guidance",
    };
  }
}
