// Free diagnosis, pure part: which collected fields may reach the Pesquisa
// model, and how its answer becomes a document. Nothing here does I/O.

import type { EquipeCardPayload } from "@/server/repositories/assistant-types";
import { DIAGNOSIS_CARD_TITLE, diagnosisSuggestions } from "@/lib/equipe/diagnosis-copy";
import { filterSuggestions } from "@/lib/equipe/suggestions";
import type { HandoffItem, HandoffOrigin, HandoffState } from "../domain/handoff";
import {
  DIAGNOSIS_LIMITS, DIAGNOSIS_READ_LIMIT, DIAGNOSIS_SOURCES, DIAGNOSIS_SOURCE_NAMES,
  type DiagnosisContent, type DiagnosisInput, type DiagnosisModelOutput, type DiagnosisSource,
} from "./diagnosis-contract";

const isPublicOrigin = (origin: HandoffOrigin): origin is DiagnosisSource => origin === "site" || origin === "instagram";
const cut = (text: string, max: number) => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
/** Cuts public text WITHOUT adding anything: whatever the model can quote must be the public wording. */
const clip = (text: string, max: number) => text.length <= max ? text : text.slice(0, max).trimEnd();

const HTML_TAGS = ["a", "abbr", "address", "article", "aside", "audio", "b", "blockquote", "body", "br", "button", "canvas", "caption", "center", "cite", "code", "col", "colgroup",
  "dd", "del", "details", "div", "dl", "dt", "em", "embed", "fieldset", "figcaption", "figure", "font", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html",
  "i", "iframe", "img", "input", "ins", "label", "li", "link", "main", "mark", "meta", "nav", "noscript", "object", "ol", "option", "p", "picture", "pre", "s", "script", "section", "select",
  "small", "source", "span", "strike", "strong", "style", "sub", "summary", "sup", "svg", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "title", "tr", "u", "ul", "video", "wbr"];
/** A real HTML tag or comment, nothing else: public text may say "<acima de R$ 200>" or "<3". */
const HTML_MARKUP = new RegExp(`<!--[\\s\\S]{0,500}?-->|</?(?:${HTML_TAGS.join("|")})(?=[\\s/>])[^<>\\n]{0,300}>`, "gi");

/** Markdown noise (images, link targets, rules) costs tokens and carries no claim. */
export function cleanPublicText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(HTML_MARKUP, " ")
    .replace(/^\s*[-*_]{3,}\s*$/gm, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Public-origin values only, clamped to what the task schema accepts (a long scraped font name must not fail the run). */
const values = (items: HandoffItem[] | undefined, count: number, chars: number) => (items ?? []).filter(item => isPublicOrigin(item.origin)).slice(0, count)
  .map(item => ({ origin: item.origin as DiagnosisSource, value: item.value.slice(0, chars) }));

/**
 * The ONLY door to the Pesquisa model (a provider that trains on its inputs,
 * accepted for public data only). It keeps fields collected from the site or
 * the confirmed Instagram; `origin=user` items, the conversation and uploads
 * never enter. Typed URLs/handles are not sent either: the model only needs to
 * know which source a text came from.
 */
export function buildDiagnosisInput(handoff: Pick<HandoffState, "captured" | "decisions">): DiagnosisInput {
  const { captured, decisions } = handoff;
  const content = (origin: DiagnosisSource) => (captured.publicContent ?? []).filter(item => item.origin === origin).map(item => item.value);
  const siteText = cleanPublicText(content("site").join("\n\n")).slice(0, DIAGNOSIS_LIMITS.siteChars);
  // Nothing read from an Instagram the person did not confirm is ever used.
  const instagramConfirmed = Boolean(decisions.networks?.some(network => network.platform === "instagram"));
  const bio = instagramConfirmed ? cleanPublicText(content("instagram").join("\n\n")).slice(0, DIAGNOSIS_LIMITS.instagramBioChars) : "";
  const posts = instagramConfirmed ? (captured.images ?? [])
    .filter(item => item.origin === "instagram" && item.caption?.trim())
    .slice(0, DIAGNOSIS_LIMITS.instagramPosts)
    .map(item => clip(cleanPublicText(item.caption!), DIAGNOSIS_LIMITS.instagramCaptionChars)) : [];
  const identity = decisions.identity;
  return {
    name: identity && isPublicOrigin(identity.name.origin) ? clip(identity.name.value, 200) : null,
    colors: values(identity?.colors, 12, 20),
    fonts: values(identity?.fonts, 12, 100),
    site: siteText ? { text: siteText } : null,
    instagram: bio || posts.length ? { bio, posts } : null,
  };
}

export function diagnosisInputSources(input: DiagnosisInput): DiagnosisSource[] {
  return DIAGNOSIS_SOURCES.filter(source => source === "site" ? Boolean(input.site) : Boolean(input.instagram));
}

/** Characters of public text available to the model (identity signals do not count as content). */
export function publicTextLength(input: DiagnosisInput) {
  return (input.site?.text.length ?? 0) + (input.instagram?.bio.length ?? 0) + (input.instagram?.posts.join("").length ?? 0);
}

export function hasEnoughPublicText(input: DiagnosisInput) {
  return publicTextLength(input) >= DIAGNOSIS_LIMITS.minPublicChars;
}

/**
 * The raw public text of each source, one entry per post/bio: the ONLY thing a quote may come from.
 * Confirmed identity signals (name, colors, fonts) and any label the server adds are context for the
 * model, never evidence: the immutable document shows a quote as the source's own words.
 */
export function diagnosisSourceParts(input: DiagnosisInput): Partial<Record<DiagnosisSource, string[]>> {
  const out: Partial<Record<DiagnosisSource, string[]>> = {};
  if (input.site) out.site = [input.site.text];
  if (input.instagram) out.instagram = [input.instagram.bio, ...input.instagram.posts].filter(Boolean);
  return out;
}

/** Verification haystack of each source: its raw parts, nothing else. */
export function diagnosisSourceTexts(input: DiagnosisInput): Partial<Record<DiagnosisSource, string>> {
  return Object.fromEntries(Object.entries(diagnosisSourceParts(input)).map(([source, parts]) => [source, parts!.join("\n")]));
}

/** Confirmed identity signals, for the model as non-quotable context. */
export function diagnosisIdentityContext(input: DiagnosisInput): string[] {
  return DIAGNOSIS_SOURCES.flatMap(origin => {
    const colors = input.colors.filter(item => item.origin === origin).map(item => item.value);
    const fonts = input.fonts.filter(item => item.origin === origin).map(item => item.value);
    return [...(colors.length ? [`colors read from the ${origin}: ${colors.join(", ")}`] : []), ...(fonts.length ? [`fonts read from the ${origin}: ${fonts.join(", ")}`] : [])];
  });
}

/** Coarse comparison used where exact wording does not matter (opportunity titles). */
export function normalizeForMatch(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\p{Cc}]+/gu, " ").replace(/\s+/g, " ").trim();
}

const COMPETITOR = /concorr|competidor|competitor|\briva(?:l|is)|concurrent/;
const mentionsCompetitors = (text: string) => COMPETITOR.test(text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());

const TYPOGRAPHIC: Record<string, string> = { "“": '"', "”": '"', "„": '"', "‟": '"', "«": '"', "»": '"', "‘": "'", "’": "'", "‚": "'", "‛": "'", "–": "-", "—": "-", "―": "-", "−": "-" };
const MARK_CHARS = new Set(["*", "`", "~"]);
// Decoration around an excerpt ("…", quotes, a closing period): trimmed at the edges only, never inside.
const EDGE = /^[\s.,;:!?"'()[\]…]+|[\s.,;:!?"'()[\]…]+$/g;
const isBoundary = (char: string | undefined) => char === undefined || /[\s\p{P}\p{S}]/u.test(char);

/**
 * Indices of the markdown marks that wrap a span as a matched pair (`*x*`, `**x**`, `~~x~~`, `` `x` ``): an opening mark
 * after a boundary and a closing mark before one, the same mark and length, inside one paragraph. A mark that stands
 * alone is text ("~30 minutos", "R$ 49,90*", "2*12", "10~20%") and stays part of what the source says.
 */
export function emphasisMarkIndices(text: string): Set<number> {
  const marked = new Set<number>();
  const openers: Array<{ char: string; length: number; start: number }> = [];
  for (let index = 0; index < text.length;) {
    const char = text[index]!;
    if (!MARK_CHARS.has(char)) { index++; continue; }
    let end = index;
    while (text[end] === char) end++;
    const length = end - index;
    const before = text[index - 1];
    const after = text[end];
    if (before === "\\") { index = end; continue; } // an escaped mark is a literal one
    if (before !== undefined && !/\s/.test(before) && isBoundary(after)) {
      let match = -1;
      for (let at = openers.length - 1; at >= 0; at--) {
        const opener = openers[at]!;
        if (/\n[ \t]*\n/.test(text.slice(opener.start + opener.length, index))) { openers.length = 0; break; }
        if (opener.char === char && opener.length === length) { match = at; break; }
      }
      if (match >= 0) {
        const opener = openers[match]!;
        for (let k = 0; k < opener.length; k++) marked.add(opener.start + k);
        for (let k = 0; k < length; k++) marked.add(index + k);
        openers.length = match;
        index = end;
        continue;
      }
    }
    if (after !== undefined && !/\s/.test(after) && isBoundary(before)) openers.push({ char, length, start: index });
    index = end;
  }
  return marked;
}

/**
 * Canonical form for verifying a quote, with the source index of every canonical character. Only case,
 * whitespace, markdown emphasis/code marks and typographic quote/dash variants are ignored: every symbol
 * that can carry meaning ("+", "-", "%", "$", "=", digits...) still has to match. No Unicode compatibility
 * folding (NFKC): it would read "10²" as "102" and "½" as "1⁄2", and a figure must be the source's figure.
 */
export function canonicalizeWithMap(text: string) {
  let norm = "";
  const map: number[] = [];
  const marks = emphasisMarkIndices(text);
  let pendingSpace = false;
  for (let index = 0; index < text.length;) {
    const at = index;
    const char = String.fromCodePoint(text.codePointAt(index)!);
    index += char.length;
    if (marks.has(at)) continue;
    for (const raw of char.toLowerCase()) {
      const c = TYPOGRAPHIC[raw] ?? raw;
      if (/\s/.test(c)) { pendingSpace = norm.length > 0; continue; }
      if (pendingSpace) { norm += " "; map.push(at); pendingSpace = false; }
      norm += c;
      for (let unit = 0; unit < c.length; unit++) map.push(at);
    }
  }
  return { norm, map, marks };
}

type Evidence = { source: DiagnosisSource; quote: string };
type SourcePart = { text: string; norm: string; map: number[]; marks: Set<number> };

const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;
/** First occurrence of the excerpt that does not begin or end inside a word: "legalmente" is not "ilegalmente", "50" is not "150". */
function indexOfWhole(haystack: string, needle: string) {
  const startsWithWord = WORD_CHAR.test(String.fromCodePoint(needle.codePointAt(0)!));
  const endsWithWord = WORD_CHAR.test([...needle].at(-1)!);
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
    const before = [...haystack.slice(Math.max(0, at - 2), at)].at(-1);
    const after = [...haystack.slice(at + needle.length, at + needle.length + 2)][0];
    if (startsWithWord && before !== undefined && WORD_CHAR.test(before)) continue;
    if (endsWithWord && after !== undefined && WORD_CHAR.test(after)) continue;
    return at;
  }
  return -1;
}

/**
 * Keeps only quotes that literally exist in the source they name, and returns the SOURCE's own
 * wording for each (never the model's spelling). Quotes that talk about competitors are dropped.
 */
function verifiedEvidence(evidence: Evidence[], sources: Partial<Record<DiagnosisSource, SourcePart[]>>) {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const item of evidence) {
    const parts = sources[item.source];
    if (!parts || item.quote.trim().length > DIAGNOSIS_LIMITS.quoteMaxChars) continue;
    const needle = canonicalizeWithMap(item.quote).norm.replace(EDGE, "");
    if (needle.length < DIAGNOSIS_LIMITS.quoteMinChars) continue;
    // One public-content part at a time (the bio, a caption, the page): an excerpt never crosses from one to the next.
    for (const [index, part] of parts.entries()) {
      const start = indexOfWhole(part.norm, needle);
      if (start < 0) continue;
      const from = part.map[start]!;
      const last = part.map[start + needle.length - 1]!;
      const end = last + String.fromCodePoint(part.text.codePointAt(last)!).length;
      // The source's own words: only the emphasis marks that wrap a span and the line breaks, which were ignored while matching, are dropped for display.
      let shown = "";
      for (let index = from; index < end; index++) if (!part.marks.has(index)) shown += part.text[index];
      const quote = shown.replace(/\s+/g, " ").trim().slice(0, DIAGNOSIS_LIMITS.quoteMaxChars + 120);
      const key = `${item.source}:${index}:${from}:${last}`;
      if (!seen.has(key) && !mentionsCompetitors(quote)) {
        seen.add(key);
        out.push({ source: item.source, quote });
      }
      break;
    }
    if (out.length >= DIAGNOSIS_LIMITS.evidencePerItem) break;
  }
  return out;
}

const sourcesOf = (evidence: Evidence[]) => DIAGNOSIS_SOURCES.filter(source => evidence.some(item => item.source === source));

const notFoundList = (modelItems: string[], leading: string[] = []) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...leading, ...modelItems]) {
    const text = cut(raw.replace(/\s+/g, " ").trim(), DIAGNOSIS_LIMITS.notFoundChars);
    const key = text.toLowerCase();
    if (!text || seen.has(key) || mentionsCompetitors(text)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= DIAGNOSIS_LIMITS.notFoundItems) break;
  }
  return out;
};

/** Sources the person gave (site address / confirmed Instagram), as opposed to sources that yielded text. */
export type DiagnosisInformed = { site: boolean; instagram: boolean };

/** What this run could not read at all: the single-source design says so instead of hiding it. */
function missingSources(inputSources: DiagnosisSource[], informed: DiagnosisInformed) {
  return [
    ...(!inputSources.includes("site") ? [informed.site ? "Site (sem texto público)" : "Site (não informado)"] : []),
    ...(!inputSources.includes("instagram") ? [informed.instagram ? "Instagram (sem texto público)" : "Instagram (não confirmado)"] : []),
  ];
}

export function diagnosisInformed(handoff: Pick<HandoffState, "source" | "decisions">): DiagnosisInformed {
  return { site: handoff.source?.kind === "site", instagram: Boolean(handoff.decisions.networks?.some(network => network.platform === "instagram")) };
}

export type DiagnosisMeta = { readingId: string; taskIntentId: string | null; model: string | null; promptVersion: string | null };

function insufficientContent(input: DiagnosisInput, brand: string | null, meta: DiagnosisMeta, reason: "too_short" | "unsupported", modelNotFound: string[], informed: DiagnosisInformed): DiagnosisContent {
  const inputSources = diagnosisInputSources(input);
  const read: Record<DiagnosisSource, string> = reason === "too_short"
    ? { site: "texto público curto demais para analisar", instagram: "bio e legendas curtas demais para analisar" }
    : { site: "li o texto público, sem trecho que sustente uma oportunidade", instagram: "li a bio e as legendas, sem trecho que sustente uma oportunidade" };
  return {
    status: "insufficient",
    brand,
    summary: `Li o que está público ${brand ? `sobre ${brand}` : "da sua marca"}, mas não encontrei conteúdo suficiente para apontar oportunidades com fonte. Nada foi inventado.`,
    channels: inputSources.map(source => ({ name: DIAGNOSIS_SOURCE_NAMES[source], source, message: read[source] })),
    opportunities: [],
    notFound: notFoundList(modelNotFound, [...missingSources(inputSources, informed), "oportunidades com fonte"]),
    sources: [],
    meta: { ...meta, inputSources },
  };
}

/**
 * Turns the model's answer into the stored document. Every claim must carry an
 * excerpt that really exists in the source it names; what does not verify is
 * dropped, never shown. No verified opportunity = an honest "insufficient"
 * document (the person is never left without a diagnosis).
 */
export function assembleDiagnosis(args: { input: DiagnosisInput; output: DiagnosisModelOutput | null; brand: string | null; meta: DiagnosisMeta; informed?: DiagnosisInformed }): DiagnosisContent {
  const { input, output, brand, meta } = args;
  const informed = args.informed ?? { site: false, instagram: false };
  const inputSources = diagnosisInputSources(input);
  if (!output || !hasEnoughPublicText(input)) return insufficientContent(input, brand, meta, "too_short", output?.notFound ?? [], informed);
  const haystacks = Object.fromEntries(Object.entries(diagnosisSourceParts(input)).map(([source, parts]) => [source,
    parts!.map(text => ({ text, ...canonicalizeWithMap(text) }))])) as Partial<Record<DiagnosisSource, SourcePart[]>>;
  const backing: DiagnosisContent["sources"] = [];
  const back = (evidence: Evidence[], supports: string) => { for (const item of evidence) backing.push({ origin: item.source, quote: item.quote, supports }); };

  const opportunities: DiagnosisContent["opportunities"] = [];
  for (const candidate of output.opportunities) {
    if (opportunities.length >= DIAGNOSIS_LIMITS.opportunities) break;
    const title = cut(candidate.title.replace(/\s+/g, " ").trim(), DIAGNOSIS_LIMITS.opportunityChars);
    const evidence = verifiedEvidence(candidate.evidence, haystacks);
    if (!title || !evidence.length || mentionsCompetitors(title) || opportunities.some(item => normalizeForMatch(item.title) === normalizeForMatch(title))) continue;
    opportunities.push({ title, sources: sourcesOf(evidence) });
    back(evidence, `opportunity:${opportunities.length}`);
  }
  if (!opportunities.length) return insufficientContent(input, brand, meta, "unsupported", output.notFound, informed);

  const channels: DiagnosisContent["channels"] = [];
  for (const candidate of output.channels) {
    if (!inputSources.includes(candidate.source) || channels.some(channel => channel.source === candidate.source)) continue;
    const message = cut(candidate.message.replace(/\s+/g, " ").trim(), DIAGNOSIS_LIMITS.channelChars);
    const evidence = verifiedEvidence(candidate.evidence, haystacks).filter(item => item.source === candidate.source);
    if (!message || !evidence.length || mentionsCompetitors(message)) continue;
    channels.push({ name: DIAGNOSIS_SOURCE_NAMES[candidate.source], source: candidate.source, message });
    back(evidence, `channel:${candidate.source}`);
  }

  const summaryText = cut(output.summary.text.replace(/\s+/g, " ").trim(), DIAGNOSIS_LIMITS.summaryChars);
  const summaryEvidence = verifiedEvidence(output.summary.evidence, haystacks);
  const summaryOk = summaryText && summaryEvidence.length > 0 && !mentionsCompetitors(summaryText);
  if (summaryOk) back(summaryEvidence, "summary");
  const summary = summaryOk ? summaryText
    : `Li o que está público ${brand ? `sobre ${brand}` : "da sua marca"} e encontrei ${opportunities.length === 1 ? "1 oportunidade" : `${opportunities.length} oportunidades`} com fonte.`;

  return {
    status: "complete", brand, summary, channels, opportunities,
    notFound: notFoundList(output.notFound, missingSources(inputSources, informed)),
    sources: backing,
    meta: { ...meta, inputSources },
  };
}

/** The readable line of the card in the conversation history (never the claims themselves). */
export function diagnosisCardLine(content: Pick<DiagnosisContent, "status" | "opportunities">) {
  return content.status === "insufficient" ? "Diagnóstico da marca · conteúdo público insuficiente"
    : `Diagnóstico da marca · ${content.opportunities.length} ${content.opportunities.length === 1 ? "oportunidade" : "oportunidades"}`;
}

/** D1 card: the stored document, copied (the document is immutable, so the card never goes stale). */
export function diagnosisCardPayload(args: { accountId: string; documentId: string; content: DiagnosisContent; readsUsed: number }): EquipeCardPayload {
  const { content } = args;
  return {
    kind: "diagnosis", accountId: args.accountId, title: DIAGNOSIS_CARD_TITLE, items: [],
    status: content.status === "insufficient" ? "insufficient" : "ready",
    documentId: args.documentId, brand: content.brand, summary: content.summary,
    channels: content.channels, opportunities: content.opportunities, notFound: content.notFound,
    // Correcting the source re-runs the handoff: only offered while a reading is left (the balance is checked when it is clicked).
    suggestions: filterSuggestions(content.status === "insufficient"
      ? diagnosisSuggestions({ status: "insufficient", readsLeft: args.readsUsed < DIAGNOSIS_READ_LIMIT })
      : diagnosisSuggestions({ status: "ready", opportunities: content.opportunities.length, notFound: content.notFound.length })),
  };
}

export function diagnosisFailureCardPayload(args: { accountId: string; code: string; retryable: boolean }): EquipeCardPayload {
  return {
    kind: "diagnosis", accountId: args.accountId, title: DIAGNOSIS_CARD_TITLE, items: [], status: "failed", failureCode: args.code,
    suggestions: filterSuggestions(diagnosisSuggestions({ status: "failed", retryable: args.retryable })),
  };
}
