/**
 * Routes Brand Kit fields so visual instructions never reach the copy generator.
 *
 * Copy may see: description, tone notes, tone of voice, and exact legal
 * disclaimers that must appear as text. Everything else (logo, hex, layout,
 * required visual elements, visual prohibitions) stays on the image path.
 */

const HEX_COLOR = /#(?:[0-9a-f]{3,8})\b/i;
const VISUAL_SIGNAL =
  /\b(logo|logotipo|wordmark|lettering|tipograf|tipografia|fonte|fontes|fundo|background|cor(?:es)?|palette|paleta|hex|rgb|cmyk|pantone|proporç|proporcao|clearspace|margem|espaçamento|espacamento|layout|composição|composicao|visual|ícone|icone|selo gráfico|selo grafico|amarelo|azul-?marinho|navy|clipart|stock\s*photo|fotografia\s+de\s+banco)\b/i;

const LEGAL_DISCLAIMER =
  /\b(aviso\s+legal|disclaimer|não\s+substitui|nao\s+substitui|apoio\s+à\s+decisão|apoio\s+a\s+decisao|julgamento\s+médico|julgamento\s+medico|dados\s+identificáveis|dados\s+identificaveis|não\s+inclua\s+dados|nao\s+inclua\s+dados)\b/i;

function splitItems(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function isVisualBrandInstruction(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (HEX_COLOR.test(trimmed)) return true;
  // Pure legal notice is not visual even if it coexists in a kit field.
  if (LEGAL_DISCLAIMER.test(trimmed) && !VISUAL_SIGNAL.test(trimmed)) return false;
  return VISUAL_SIGNAL.test(trimmed);
}

export function isLegalDisclaimerText(text: string): boolean {
  const trimmed = text.trim();
  if (!LEGAL_DISCLAIMER.test(trimmed)) return false;
  // Mixed visual+legal blobs are not copy-safe as a whole — extract later.
  return !VISUAL_SIGNAL.test(trimmed) && !HEX_COLOR.test(trimmed);
}

/** Pull exact legal sentences out of a free-text brand field (legacy kits). */
function extractLegalDisclaimers(text: string): string[] {
  const found: string[] = [];
  for (const item of splitItems(text)) {
    if (isLegalDisclaimerText(item)) {
      found.push(item);
      continue;
    }
    // Mixed item: keep only the legal sentence(s).
    if (!LEGAL_DISCLAIMER.test(item)) continue;
    const sentences = item
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && isLegalDisclaimerText(s));
    found.push(...sentences);
  }
  return found;
}

export interface CopySafeBrandVoice {
  /** Tone of voice + tone notes merged for the copywriter. */
  toneOfVoice: string | null;
  /** Exact legal strings that must appear once in the copy. */
  legalDisclaimers: string[];
  /** Copy-side prohibitions only (never visual rules). */
  prohibitedClaims: string[];
}

/**
 * Deterministic read-time partition of a Brand Kit for the copy path.
 * Legacy free-text kits need no migration — visual lines are dropped here.
 */
export function partitionBrandKitForCopy(input: {
  description?: string | null;
  toneNotes?: string | null;
  toneOfVoice?: string | null;
  requiredElements?: string | null;
  prohibitedElements?: string | null;
  constraints?: string | null;
}): CopySafeBrandVoice {
  const toneParts = [
    input.toneOfVoice?.trim(),
    input.toneNotes?.trim(),
    input.description?.trim(),
  ].filter((part): part is string => Boolean(part && part.length > 0));

  const legalDisclaimers: string[] = [];
  const seenLegal = new Set<string>();
  for (const item of [
    ...extractLegalDisclaimers(input.requiredElements ?? ""),
    ...extractLegalDisclaimers(input.constraints ?? ""),
  ]) {
    const key = item.toLocaleLowerCase("pt-BR");
    if (seenLegal.has(key)) continue;
    seenLegal.add(key);
    legalDisclaimers.push(item);
  }

  const prohibitedClaims = splitItems(input.prohibitedElements).filter(
    (item) => !isVisualBrandInstruction(item),
  );

  return {
    toneOfVoice: toneParts.length > 0 ? toneParts.join("\n") : null,
    legalDisclaimers,
    prohibitedClaims,
  };
}

/**
 * Fact-pack brand slice for copy grounding: only legal required text and
 * non-visual prohibitions. Visual required/prohibited stay out so the model
 * cannot echo them as headline/body/cta.
 */
export function copySafeBrandElements(input: {
  requiredElements?: string | null;
  prohibitedElements?: string | null;
  constraints?: string | null;
}): { requiredElements: string[]; prohibitedElements: string[] } {
  const seen = new Set<string>();
  const requiredElements = [
    ...extractLegalDisclaimers(input.requiredElements ?? ""),
    ...extractLegalDisclaimers(input.constraints ?? ""),
  ].filter((item) => {
    const key = item.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    requiredElements,
    prohibitedElements: splitItems(input.prohibitedElements).filter(
      (item) => !isVisualBrandInstruction(item),
    ),
  };
}
