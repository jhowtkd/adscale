import type { ContentBrief } from "@/server/ai/image-analysis";
import type { GenerationMode } from "@/server/generation/canonical/types";
import {
  CREATIVE_WORK_FACT_PACK_VERSION,
  type CreativeFact,
  type CreativeFactClass,
  type CreativeSourceUsage,
  type CreativeWorkFactPack,
  type CreativeWorkBriefingOverrides,
  type SocialPostCopy,
} from "./contracts";

/**
 * R-002 / spec 7.1–7.3 — fact pack: the auditable projection of everything a
 * copy (and later the image) is allowed to state. The request, the source
 * analyses and the brand kit remain the sources of truth; this module only
 * normalizes facts with explicit provenance and validates that generated copy
 * never states a claim without an origin. Missing information stays missing —
 * nothing here invents placeholders such as "Público da marca".
 */

export interface CreativeWorkFactPackSourceInput {
  sourceId: string;
  /** Effective usage after protocol inference. Style-only sources never contribute facts. */
  usage: CreativeSourceUsage;
  content: ContentBrief | null;
}

export interface CreativeWorkFactPackBrandInput {
  name: string | null;
  requiredElements: string | null;
  prohibitedElements: string | null;
}

/**
 * Single brand-kit → fact-pack brand mapping shared by the prepare and
 * generate commands (previously duplicated verbatim in both).
 */
export function creativeWorkFactPackBrandFromKit(brandKit: {
  name?: string | null;
  requiredElements?: string | null;
  prohibitedElements?: string | null;
} | null): CreativeWorkFactPackBrandInput | null {
  if (!brandKit) return null;
  return {
    name: brandKit.name ?? null,
    requiredElements: brandKit.requiredElements ?? null,
    prohibitedElements: brandKit.prohibitedElements ?? null,
  };
}

const PT_BR = "pt-BR";
const MONTH_PATTERN =
  "janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
const AVAILABILITY_PATTERN =
  "vagas?\\s+limitadas?|últimas\\s+vagas|ultimas\\s+vagas|turmas?\\s+limitadas?|edição\\s+limitada|edicao\\s+limitada|por\\s+tempo\\s+limitado";
const MODALITY_PATTERN = "\\bonline\\b|\\bpresencial\\w*\\b|\\bao\\s+vivo\\b|\\bead\\b";

/**
 * Deterministic extractors over explicit user text. They only capture values
 * that are literally written — nothing is inferred — and every captured value
 * is required to survive into the piece because the user stated it.
 */
const REQUEST_FACT_EXTRACTORS: ReadonlyArray<{ class: CreativeFactClass; pattern: RegExp }> = [
  { class: "price", pattern: /r\$\s*\d(?:[\d.,]*\d)?/gi },
  { class: "price", pattern: /\d+(?:[.,]\d+)?\s*%/g },
  { class: "date", pattern: /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g },
  { class: "date", pattern: new RegExp(`\\b(?:${MONTH_PATTERN})\\b(?:\\s+de\\s+\\d{4})?`, "gi") },
  { class: "condition", pattern: new RegExp(AVAILABILITY_PATTERN, "gi") },
  { class: "credential", pattern: /certifica\w+|credencia\w+|iso\s*\d{3,5}/gi },
  { class: "guarantee", pattern: /garantia\w*/gi },
  { class: "modality", pattern: new RegExp(MODALITY_PATTERN, "gi") },
];

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase(PT_BR).replace(/\s+/g, " ").trim();
}

function extractRequestFacts(request: string): CreativeFact[] {
  const facts: CreativeFact[] = [];
  const seen = new Set<string>();
  for (const { class: factClass, pattern } of REQUEST_FACT_EXTRACTORS) {
    for (const match of request.matchAll(pattern)) {
      const value = match[0].replace(/\s+/g, " ").trim();
      if (!value) continue;
      const key = `${factClass}:${normalizeKey(value)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Facts explicitly stated in the request must survive into the piece
      // (e.g. "agosto" and "vagas limitadas" in the Psicologia journey).
      facts.push({ value, class: factClass, required: true, origin: "request" });
    }
  }
  return facts;
}

function sourceFactsFromContent(
  source: CreativeWorkFactPackSourceInput,
  required: boolean,
): CreativeFact[] {
  const content = source.content;
  if (!content) return [];
  const facts: CreativeFact[] = [];
  const push = (value: string | null | undefined, factClass: CreativeFactClass) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    facts.push({ value: trimmed, class: factClass, required, origin: "source", sourceId: source.sourceId });
  };
  push(content.product, "product");
  push(content.offer, "offer");
  push(content.textContent?.headline, "text");
  for (const bullet of content.textContent?.bullets ?? []) push(bullet, "text");
  push(content.cta?.text, "text");
  for (const element of content.brandElements ?? []) push(element, "brand");
  return facts;
}

function splitBrandElements(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Which brand governs the piece (R-003 / spec 8.4). Default "active": the
 * workspace brand kit. "source": the explicit brand found in the content art,
 * chosen by the user on a restyle brand conflict — the source brand becomes
 * the required identity and the ACTIVE kit's required/prohibited elements no
 * longer apply (they belong to the other brand; the art's own elements are
 * already projected as source facts).
 */
export type CreativeWorkBrandAuthority =
  | { kind: "active" }
  | { kind: "source"; brandName: string };

/**
 * Build the frozen, auditable fact projection for a work. All outputs of the
 * work share this single contract (R-002 criterion 4). For format adaptation
 * the facts and essential text of the original art are required; style-only
 * sources never contribute factual truth (criterion 2).
 */
export function buildCreativeWorkFactPack(input: {
  request: string;
  /** Canonical mode resolved by the protocol translation (R-001), not re-inferred here. */
  mode: GenerationMode;
  sources: readonly CreativeWorkFactPackSourceInput[];
  brand: CreativeWorkFactPackBrandInput | null;
  clientProfileId: string;
  /** Resolved brand authority (R-003). Defaults to the active workspace brand. */
  brandAuthority?: CreativeWorkBrandAuthority;
  /** Explicit operator edits are request-authoritative facts. */
  briefingOverrides?: CreativeWorkBriefingOverrides;
}): CreativeWorkFactPack {
  const adaptation = input.mode === "format_adaptation";
  const sourceAuthority = input.brandAuthority?.kind === "source" ? input.brandAuthority : null;
  const facts: CreativeFact[] = [];
  const seen = new Set<string>();
  const pushAll = (candidates: readonly CreativeFact[]) => {
    for (const fact of candidates) {
      const key = [fact.class, fact.origin, fact.sourceId ?? "", normalizeKey(fact.value)].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push(fact);
    }
  };

  pushAll(extractRequestFacts(input.request));
  for (const [field, value] of Object.entries(input.briefingOverrides ?? {})) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    pushAll([{
      value: trimmed,
      class: field === "offer" ? "offer" : "text",
      required: true,
      origin: "request",
    }]);
  }
  for (const source of input.sources) {
    if (source.usage === "style") continue;
    pushAll(sourceFactsFromContent(source, adaptation));
  }
  const brandName = sourceAuthority
    ? sourceAuthority.brandName.trim() || null
    : input.brand?.name?.trim() || null;
  if (brandName) {
    pushAll([{ value: brandName, class: "brand", required: true, origin: "brand" }]);
  }

  return {
    version: CREATIVE_WORK_FACT_PACK_VERSION,
    request: input.request,
    facts,
    brand: {
      requiredElements: sourceAuthority ? [] : splitBrandElements(input.brand?.requiredElements),
      prohibitedElements: sourceAuthority ? [] : splitBrandElements(input.brand?.prohibitedElements),
    },
    identity: {
      clientProfileId: input.clientProfileId,
      brandName,
      brandAuthority: sourceAuthority ? "source" : "active",
    },
  };
}

// ---------------------------------------------------------------------------
// Structured copy validation against the fact pack (spec 7.3).
// ---------------------------------------------------------------------------

export type CopyClaimField = "headline" | "body" | "cta";

export interface CopyClaimViolation {
  class: CreativeFactClass;
  /** The claim text as it appears in the copy. */
  value: string;
  field: CopyClaimField;
}

/** Keep only characters that carry factual identity; immune to punctuation/spacing variance. */
function normalizeTight(value: string): string {
  return value.toLocaleLowerCase(PT_BR).replace(/[^a-zà-ÿ0-9%$]+/gi, "");
}

function normalizeLoose(value: string): string {
  return value.toLocaleLowerCase(PT_BR).replace(/\s+/g, " ").trim();
}

function corpusNumericTokens(corpus: string): Set<string> {
  return new Set([...corpus.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => match[0]));
}

/**
 * Claim-atom detectors. A copy may only contain these when the same value
 * exists in an origin (request, sourced fact or brand). Bare numbers are
 * checked separately against exact numeric tokens of the corpus so that "2"
 * is not backed by an unrelated "20%".
 */
const CLAIM_ATOM_DETECTORS: ReadonlyArray<{ class: CreativeFactClass; pattern: RegExp }> = [
  { class: "price", pattern: /r\$\s*\d(?:[\d.,]*\d)?/gi },
  { class: "price", pattern: /\d+(?:[.,]\d+)?\s*%/g },
  { class: "date", pattern: /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g },
  { class: "date", pattern: new RegExp(`\\b(?:${MONTH_PATTERN})\\b`, "gi") },
  { class: "condition", pattern: new RegExp(AVAILABILITY_PATTERN, "gi") },
  { class: "credential", pattern: /certifica\w+|credencia\w+|iso\s*\d{3,5}/gi },
  { class: "guarantee", pattern: /garantia\w*/gi },
  // Modality is never inferable (spec 7.2): the request extractor captures it,
  // so copy may only state a modality that an origin already stated.
  { class: "modality", pattern: new RegExp(MODALITY_PATTERN, "gi") },
  { class: "benefit", pattern: /grátis|gratuito\w*|bônus|brinde\w*/gi },
  { class: "proof", pattern: /comprov\w+|premia\w+|reconhec\w+/gi },
];

/**
 * Capitalized words that commonly appear in pt-BR ad copy without being
 * proper nouns. Only multi-word capitalized runs are treated as entities, so
 * single emphasis words (e.g. "Grátis Hoje") never trigger this list.
 */
const ENTITY_STOPWORDS = new Set(
  [
    "De", "Da", "Do", "Das", "Dos", "E", "Em", "No", "Na", "Nos", "Nas", "Ao", "Aos", "À", "Às",
    "Um", "Uma", "Para", "Por", "Pela", "Pelo", "Com", "Sem", "Sob", "Sobre", "Até", "Após",
    "Seu", "Sua", "Seus", "Suas", "Nosso", "Nossa", "Nossos", "Nossas", "Meu", "Minha", "Meus",
    "Minhas", "Você", "Vocês", "Nós", "Eu", "Isso", "Este", "Esta", "Neste", "Nesta", "Nesse",
    "Nessa", "Aqui", "Agora", "Hoje", "Sempre", "Mais", "Menos", "Muito", "Muita", "Muitos",
    "Muitas", "Tudo", "Toda", "Todo", "Todos", "Todas", "Cada", "Outra", "Outro", "Outras",
    "Outros", "Nova", "Novo", "Grande", "Melhor", "Maior", "Primeira", "Primeiro", "Última",
    "Último", "Bom", "Boa", "Feliz", "Especial", "Exclusivo", "Exclusiva", "Imperdível",
    "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo", "Feira",
    "Comece", "Descubra", "Conheça", "Aproveite", "Garanta", "Saiba", "Transforme",
    "Inscreva-se", "Matricule-se", "Cadastre-se", "Fale", "Clique", "Agende", "Experimente",
  ],
);

function maskSpan(chars: string[], index: number, length: number) {
  for (let offset = 0; offset < length; offset += 1) {
    chars[index + offset] = " ";
  }
}

/** Multi-word capitalized runs (likely brand/product names) absent from the corpus. */
function findUnbackedEntities(maskedText: string, tightCorpus: string): string[] {
  const candidates: string[] = [];
  for (const sentence of maskedText.split(/[.!?\n]+/)) {
    const words = sentence.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*/g) ?? [];
    let sentenceStartPending = true;
    let run: string[] = [];
    const flush = () => {
      if (run.length >= 2) candidates.push(run.join(" "));
      run = [];
    };
    for (const word of words) {
      // The first word of a sentence is capitalized by grammar, not by name.
      if (sentenceStartPending) {
        sentenceStartPending = false;
        continue;
      }
      const isAllCaps = /[A-ZÀ-Ý]/.test(word) && word === word.toLocaleUpperCase(PT_BR);
      const isCapitalized = /^[A-ZÀ-Ý][a-zà-ÿ]/.test(word);
      if (isCapitalized && !isAllCaps && !ENTITY_STOPWORDS.has(word)) {
        run.push(word);
      } else {
        flush();
      }
    }
    flush();
  }
  return candidates.filter((candidate) => !tightCorpus.includes(normalizeTight(candidate)));
}

/**
 * Structured textual validation (spec 7.3): every claim in the copy that
 * belongs to a never-inferable class must trace to the request, a sourced
 * fact or the brand. Pure and deterministic — the rewrite policy (one
 * attempt, then block) lives in copy.ts.
 */
export function validateSocialPostCopyAgainstFactPack(
  copy: Pick<SocialPostCopy, "headline" | "body" | "cta">,
  factPack: CreativeWorkFactPack,
): CopyClaimViolation[] {
  const corpus = [
    factPack.request,
    ...factPack.facts.map((fact) => fact.value),
    factPack.identity.brandName ?? "",
    ...factPack.brand.requiredElements,
    // Prohibited brand elements are deliberately NOT part of the backing
    // corpus: they are never a factual origin. Their presence in the copy is
    // a violation of its own (see the dedicated check below).
  ].join("\n");
  const looseCorpus = normalizeLoose(corpus);
  const tightCorpus = normalizeTight(corpus);
  const numericTokens = corpusNumericTokens(corpus);

  const violations: CopyClaimViolation[] = [];
  const fields = [
    ["headline", copy.headline],
    ["body", copy.body],
    ["cta", copy.cta],
  ] as const;

  for (const [field, text] of fields) {
    const masked = text.split("");
    for (const { class: factClass, pattern } of CLAIM_ATOM_DETECTORS) {
      for (const match of text.matchAll(pattern)) {
        const value = match[0].trim();
        maskSpan(masked, match.index ?? 0, match[0].length);
        if (!value) continue;
        const backed = /\d/.test(value)
          ? tightCorpus.includes(normalizeTight(value))
          : looseCorpus.includes(normalizeLoose(value));
        if (!backed) violations.push({ class: factClass, value, field });
      }
    }
    const maskedText = masked.join("");
    for (const match of maskedText.matchAll(/\b\d+(?:[.,]\d+)?\b/g)) {
      if (!numericTokens.has(match[0])) {
        violations.push({ class: "proof", value: match[0], field });
      }
    }
    for (const entity of findUnbackedEntities(maskedText, tightCorpus)) {
      violations.push({ class: "brand", value: entity, field });
    }
  }

  // Prohibited brand elements (R-002): their mere presence in the copy is its
  // own violation — class "brand", the element as stated in the brand kit —
  // independent of any provenance check. This runs after the atom pass so an
  // echo of a prohibited element can never count as "backed".
  for (const element of factPack.brand.prohibitedElements) {
    const needle = normalizeLoose(element);
    if (!needle) continue;
    for (const [field, text] of fields) {
      if (normalizeLoose(text).includes(needle)) {
        violations.push({ class: "brand", value: element, field });
      }
    }
  }
  return violations;
}
