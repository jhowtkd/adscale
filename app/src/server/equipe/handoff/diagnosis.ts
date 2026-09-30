// Free diagnosis, pure part: which collected fields may reach the Pesquisa
// model, and how its answer becomes a document. Nothing here does I/O.

import type { EquipeCardPayload } from "@/server/repositories/assistant-types";
import { DIAGNOSIS_CARD_TITLE, diagnosisSuggestions } from "@/lib/equipe/diagnosis-copy";
import { filterSuggestions } from "@/lib/equipe/suggestions";
import type { HandoffItem, HandoffOrigin, HandoffState } from "../domain/handoff";
import {
  DIAGNOSIS_LIMITS, DIAGNOSIS_SOURCES, DIAGNOSIS_SOURCE_NAMES,
  type DiagnosisContent, type DiagnosisInput, type DiagnosisModelOutput, type DiagnosisSource,
} from "./diagnosis-contract";

const isPublicOrigin = (origin: HandoffOrigin): origin is DiagnosisSource => origin === "site" || origin === "instagram";
const cut = (text: string, max: number) => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

/** Markdown noise (images, link targets, rules) costs tokens and carries no claim. */
export function cleanPublicText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>\n]{1,200}>/g, " ")
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
    .map(item => cut(cleanPublicText(item.caption!), DIAGNOSIS_LIMITS.instagramCaptionChars)) : [];
  const identity = decisions.identity;
  return {
    name: identity && isPublicOrigin(identity.name.origin) ? cut(identity.name.value, 200) : null,
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

/** Confirmed identity signals are quotable evidence of the source they were read from. */
function identityLines(input: DiagnosisInput, origin: DiagnosisSource) {
  const colors = input.colors.filter(item => item.origin === origin).map(item => item.value);
  const fonts = input.fonts.filter(item => item.origin === origin).map(item => item.value);
  return [
    ...(colors.length ? [`Cores confirmadas: ${colors.join(", ")}`] : []),
    ...(fonts.length ? [`Fontes confirmadas: ${fonts.join(", ")}`] : []),
  ];
}

/**
 * The exact text of each source as the model sees it. Verification quotes are
 * checked against this same text, so the prompt and the check cannot drift.
 */
export function diagnosisSourceTexts(input: DiagnosisInput): Partial<Record<DiagnosisSource, string>> {
  const out: Partial<Record<DiagnosisSource, string>> = {};
  if (input.site) out.site = [input.site.text, ...identityLines(input, "site")].filter(Boolean).join("\n\n");
  if (input.instagram) {
    out.instagram = [
      input.instagram.bio && `Bio: ${input.instagram.bio}`,
      ...input.instagram.posts.map((caption, index) => `Legenda ${index + 1}: ${caption}`),
      ...identityLines(input, "instagram"),
    ].filter(Boolean).join("\n");
  }
  return out;
}

/** Punctuation, markdown and case differences never make an honest quote fail. */
export function normalizeForMatch(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\p{Cc}]+/gu, " ").replace(/\s+/g, " ").trim();
}

const COMPETITOR = /concorr|competidor|competitor|\brival|concurrent/;
const mentionsCompetitors = (text: string) => COMPETITOR.test(text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());

type Evidence = { source: DiagnosisSource; quote: string };

function verifiedEvidence(evidence: Evidence[], haystacks: Partial<Record<DiagnosisSource, string>>) {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const item of evidence) {
    const quote = item.quote.trim();
    const haystack = haystacks[item.source];
    if (!haystack || quote.length > DIAGNOSIS_LIMITS.quoteMaxChars) continue;
    const needle = normalizeForMatch(quote);
    if (needle.length < DIAGNOSIS_LIMITS.quoteMinChars || !haystack.includes(needle)) continue;
    const key = `${item.source}:${needle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ source: item.source, quote });
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
  const haystacks = Object.fromEntries(Object.entries(diagnosisSourceTexts(input)).map(([source, text]) => [source, normalizeForMatch(text)])) as Partial<Record<DiagnosisSource, string>>;
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
    // Correcting the source re-runs the handoff: only offered while a failed read can still be retried.
    suggestions: filterSuggestions(content.status === "insufficient"
      ? diagnosisSuggestions({ status: "insufficient", readsLeft: args.readsUsed <= 1 })
      : diagnosisSuggestions({ status: "ready", opportunities: content.opportunities.length, notFound: content.notFound.length })),
  };
}

export function diagnosisFailureCardPayload(args: { accountId: string; code: string; retryable: boolean }): EquipeCardPayload {
  return {
    kind: "diagnosis", accountId: args.accountId, title: DIAGNOSIS_CARD_TITLE, items: [], status: "failed", failureCode: args.code,
    suggestions: filterSuggestions(diagnosisSuggestions({ status: "failed", retryable: args.retryable })),
  };
}
