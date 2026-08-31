import "server-only";
import { createHash } from "node:crypto";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getOpenAI } from "@/server/ai/utils";
import { isE2EControlledProviderEnabled } from "@/server/ai/providers/e2e-controlled-provider";
import { env } from "@/server/validation/env";
import {
  CAROUSEL_NARRATIVE_ROLES,
  carouselBlockingQuestionSchema,
  carouselLayoutFamilyForRole,
  validateTextFieldsAgainstFactPack,
  type CarouselDeckPlanV1,
  type CarouselDraftStateV1,
  type CarouselEditorialChangeV1,
  type CarouselNarrativeRole,
  type CarouselSlidePlanV1,
} from "./carousel-contracts";
import type { CreativeFact, CreativeWorkFactPack } from "./contracts";
import { canonicalJsonStringify } from "./canonical-json";

export type CarouselEditorialFindingCode =
  | "slide_count"
  | "missing_hook"
  | "duplicate_idea"
  | "broken_transition"
  | "unresolved_promise"
  | "forced_cta"
  | "text_density"
  | "generic_phrase"
  | "blase_tone"
  | "unsupported_claim";

export type CarouselEditorialFinding = {
  code: CarouselEditorialFindingCode;
  path: string;
  message: string;
  blocking: boolean;
};

/**
 * Typed failure for a planner response that cannot be trusted. The caller must
 * keep the last persisted draft — never silently fall back to a guessed deck.
 */
export class CarouselEditorialPlanInvalidError extends Error {
  readonly code = "editorial_plan_invalid" as const;
  constructor(message = "carousel editorial plan response was invalid") {
    super(message);
    this.name = "CarouselEditorialPlanInvalidError";
  }
}

export function stableSlideId(workId: string, position: number): string {
  const hex = createHash("sha256").update(`${workId}:carousel:${position}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const carouselSlideProposalSchema = z.object({
  role: z.enum(CAROUSEL_NARRATIVE_ROLES),
  purpose: z.string().trim().min(1).max(320),
  primaryText: z.string().trim().min(1).max(400),
  secondaryText: z.string().trim().max(400).nullable(),
  sourceFactIds: z.array(z.string().trim().min(1)).max(8),
}).strict();
export type CarouselSlideProposal = z.infer<typeof carouselSlideProposalSchema>;

const carouselEditorialChangeProposalSchema = z.object({
  slideIndex: z.number().int().min(1).max(8).nullable(),
  field: z.enum(["position", "role", "purpose", "primaryText", "secondaryText"]),
  before: z.union([z.string(), z.number()]).nullable(),
  after: z.union([z.string(), z.number()]).nullable(),
  reason: z.string().trim().min(1).max(500),
}).strict();
export type CarouselEditorialChangeProposal = z.infer<typeof carouselEditorialChangeProposalSchema>;

export const carouselPlannerResponseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("questions"),
    questions: z.array(carouselBlockingQuestionSchema).min(1).max(3),
  }).strict(),
  z.object({
    kind: z.literal("deck"),
    objective: z.string().trim().min(1).max(240),
    audience: z.string().trim().max(240).nullable(),
    tone: z.string().trim().max(240).nullable(),
    promise: z.string().trim().min(1).max(320),
    slides: z.array(carouselSlideProposalSchema).min(5).max(8),
    changes: z.array(carouselEditorialChangeProposalSchema).max(40),
  }).strict(),
]);
export type CarouselPlannerResponse = z.infer<typeof carouselPlannerResponseSchema>;

/** Exact product rules block — never paraphrased into the planner prompt. */
const CAROUSEL_PRODUCT_RULES = [
  "Write in natural pt-BR. One main idea per slide. Use 5 to 8 slides because the arc needs them, never to fill a quota.",
  "You may cut, condense, reorder, split, merge and rewrite. Explain every change in the changes array.",
  "Never invent a price, number, date, offer, benefit, proof, condition, credential, modality, guarantee, brand, product or service.",
  "If a missing fact prevents a safe deck, return only concrete blocking questions. Unknown stays unknown.",
  "Reject generic phrases that could belong to any brand, inflated claims, empty motivational language, AI meta-language and a blase tone.",
  "The first slide is hook. CTA is optional and never forced.",
].join("\n");

const CAROUSEL_PLANNER_SYSTEM_PROMPT = [
  "You are the editorial planner of pt-BR Instagram carousels for ADScale Studio.",
  "",
  CAROUSEL_PRODUCT_RULES,
  "",
  'Return ONLY JSON matching the response schema: either { kind: "questions", questions: [1-3 items] } or { kind: "deck", objective, audience, tone, promise, slides: [5-8 items], changes: [<=40 items] }.',
  "Slides are ordered; the array order is the deck position. Never invent slide ids, positions or layout families.",
].join("\n");

// ---------------------------------------------------------------------------
// Deterministic lint: concrete findings, never one aggregate score.
// ---------------------------------------------------------------------------

const GENERIC_PHRASES = [
  "transforme sua vida",
  "mude sua vida",
  "a melhor escolha",
  "solução completa",
  "leve seu negócio ao próximo nível",
  "não fique para trás",
  "resultados incríveis",
  "qualidade garantida",
  "tudo o que você precisa",
];

const BLASE_PHRASES = [
  "neste post",
  "neste carrossel",
  "neste conteúdo",
  "apresentamos",
  "veja abaixo",
  "confira abaixo",
  "deslize",
  "um post sobre",
];

const CTA_KEYWORDS = [
  "compre", "comprar", "inscreva", "cadastre", "agende", "clique", "saiba mais",
  "fale conosco", "chame no", "whatsapp", "entre em contato", "baixe", "baixar",
  "assine", "assinar", "experimente", "garanta", "matricule", "comece agora", "acesse",
];

const DENSITY_BUDGETS: Record<CarouselSlidePlanV1["layoutFamily"], { primary: number; secondary: number }> = {
  impact: { primary: 140, secondary: 90 },
  development: { primary: 170, secondary: 120 },
  respite: { primary: 120, secondary: 90 },
};

function normalizeText(value: string): string {
  return value.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

function contentWords(value: string): string[] {
  return value
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}%]/gu, ""))
    .filter((word) => word.length >= 4);
}

/**
 * Pure editorial lint of one deck against its fact pack. Grounding and
 * structural integrity block; tone, density and clichés stay advisory.
 */
export function lintCarouselDeck(input: {
  deck: CarouselDeckPlanV1;
  factPack: CreativeWorkFactPack;
}): CarouselEditorialFinding[] {
  const findings: CarouselEditorialFinding[] = [];
  const { deck, factPack } = input;

  if (deck.slides.length < 5 || deck.slides.length > 8) {
    findings.push({
      code: "slide_count",
      path: "slides",
      message: "carousel deck must have between 5 and 8 slides",
      blocking: true,
    });
  }
  if (deck.slides[0] && deck.slides[0].role !== "hook") {
    findings.push({
      code: "missing_hook",
      path: "slides.0.role",
      message: "the first slide must be the hook",
      blocking: true,
    });
  }

  const firstOccurrence = new Map<string, number>();
  deck.slides.forEach((slide, index) => {
    const key = normalizeText(slide.primaryText);
    const first = firstOccurrence.get(key);
    if (first === undefined) {
      firstOccurrence.set(key, index);
      return;
    }
    findings.push({
      code: "duplicate_idea",
      path: `slides.${index}.primaryText`,
      message: `repeats the main idea of slide ${first + 1}`,
      blocking: true,
    });
  });

  deck.slides.forEach((slide, index) => {
    if ((slide.role === "closing" || slide.role === "cta") && index < deck.slides.length - 1) {
      findings.push({
        code: "broken_transition",
        path: `slides.${index}.role`,
        message: "the deck keeps going after a closing or CTA slide",
        blocking: false,
      });
    }
  });

  const slideCorpus = deck.slides
    .map((slide) => `${slide.primaryText} ${slide.secondaryText ?? ""}`)
    .join(" ")
    .toLocaleLowerCase("pt-BR");
  const promiseWords = contentWords(deck.promise);
  if (promiseWords.length > 0 && !promiseWords.some((word) => slideCorpus.includes(word))) {
    findings.push({
      code: "unresolved_promise",
      path: "promise",
      message: "the hook promise is never resolved by any slide",
      blocking: true,
    });
  }

  const hasCtaSlide = deck.slides.some((slide) => slide.role === "cta");
  if (hasCtaSlide) {
    const hasOfferFact = factPack.facts.some((fact) => fact.class === "offer");
    const requestHasCta = CTA_KEYWORDS.some((keyword) => normalizeText(factPack.request).includes(keyword));
    const factsHaveCta = factPack.facts.some(
      (fact) => fact.class === "text" && CTA_KEYWORDS.some((keyword) => normalizeText(fact.value).includes(keyword)),
    );
    if (!hasOfferFact && !requestHasCta && !factsHaveCta) {
      const ctaIndex = deck.slides.findIndex((slide) => slide.role === "cta");
      findings.push({
        code: "forced_cta",
        path: `slides.${ctaIndex}.role`,
        message: "the deck forces a CTA with no CTA or offer in the request or facts",
        blocking: true,
      });
    }
  }

  deck.slides.forEach((slide, index) => {
    const budget = DENSITY_BUDGETS[slide.layoutFamily];
    const primaryLength = slide.primaryText.trim().length;
    const secondaryLength = (slide.secondaryText ?? "").trim().length;
    if (primaryLength > budget.primary || secondaryLength > budget.secondary) {
      findings.push({
        code: "text_density",
        path: `slides.${index}`,
        message: `primary+secondary text exceeds the ${slide.layoutFamily} region budget`,
        blocking: false,
      });
    }
    const slideText = normalizeText(`${slide.primaryText} ${slide.secondaryText ?? ""}`);
    for (const phrase of GENERIC_PHRASES) {
      if (slideText.includes(phrase)) {
        findings.push({
          code: "generic_phrase",
          path: `slides.${index}.primaryText`,
          message: `generic phrase that could belong to any brand: "${phrase}"`,
          blocking: false,
        });
        break;
      }
    }
    for (const phrase of BLASE_PHRASES) {
      if (slideText.includes(phrase)) {
        findings.push({
          code: "blase_tone",
          path: `slides.${index}.primaryText`,
          message: `AI meta-language or blase tone: "${phrase}"`,
          blocking: false,
        });
        break;
      }
    }
  });

  const violations = validateTextFieldsAgainstFactPack(
    deck.slides.flatMap((slide, index) => [
      { field: `slides.${index}.primaryText`, text: slide.primaryText },
      ...(slide.secondaryText ? [{ field: `slides.${index}.secondaryText`, text: slide.secondaryText }] : []),
    ]),
    factPack,
  );
  for (const violation of violations) {
    findings.push({
      code: "unsupported_claim",
      path: violation.field,
      message: `"${violation.value}" (${violation.class}) has no origin in the request or facts`,
      blocking: true,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// One structured planning call (or its deterministic E2E counterpart).
// ---------------------------------------------------------------------------

type ProposeCarouselDraftInput = {
  workId: string;
  request: string;
  answers: Record<string, string>;
  previous: CarouselDraftStateV1 | null;
  factPack: CreativeWorkFactPack;
  toneOfVoice: string | null;
};

function shortHash(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 12);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max).trim();
}

const CONTROLLED_ROLES: CarouselNarrativeRole[] = ["hook", "context", "problem", "evidence", "closing"];

/** Deterministic E2E-only markers consumed by the controlled planner. */
const CONTROLLED_ASK_MARKER = "[e2e:ask-once]";
const CONTROLLED_E2E_MARKERS = /\[e2e:[a-z-]+\]/g;

function controlledBaseText(input: ProposeCarouselDraftInput): string {
  const raw = input.factPack.request.trim() || input.factPack.facts[0]?.value || "Conteúdo do carrossel";
  return raw.replace(CONTROLLED_E2E_MARKERS, "").replace(/\s+/g, " ").trim();
}

function controlledSlideTexts(base: string, facts: readonly CreativeFact[]): string[] {
  const words = base.split(/\s+/).filter(Boolean);
  const texts: string[] = [];
  if (words.length >= 5) {
    const per = Math.ceil(words.length / 5);
    for (let index = 0; index < words.length && texts.length < 5; index += per) {
      texts.push(words.slice(index, index + per).join(" "));
    }
  }
  for (const fact of facts) {
    if (texts.length >= 5) break;
    if (!texts.includes(fact.value)) texts.push(fact.value);
  }
  let pad = 2;
  while (texts.length < 5) {
    texts.push(`${base} — ${pad}`);
    pad += 1;
  }
  return texts.slice(0, 5);
}

/**
 * Deterministic E2E deck derived only from the request and facts. When the
 * operator asked for the one-question path (`[e2e:ask-once]`) and it was not
 * answered yet, the planner asks exactly ONE blocking question; the merged
 * answer unblocks the deck on the next call. That same marker path carries
 * one tracked suggestion so the wizard's accept/reject surface stays
 * exercised; the plain controlled deck (no marker) never changes shape.
 */
function controlledPlannerResponse(input: ProposeCarouselDraftInput): CarouselPlannerResponse {
  const mergedAnswers = { ...(input.previous?.answers ?? {}), ...input.answers };
  const asksOnce = input.request.includes(CONTROLLED_ASK_MARKER);
  if (asksOnce && !Object.keys(mergedAnswers).some((field) => field.startsWith("e2e-"))) {
    return {
      kind: "questions",
      questions: [{
        id: "e2e-cta",
        field: "cta",
        question: "Qual chamada para ação deve fechar o carrossel?",
        reason: "Pergunta controlada do provedor E2E: responda para organizar a sequência.",
      }],
    };
  }
  const base = controlledBaseText(input);
  const texts = controlledSlideTexts(base, input.factPack.facts);
  const suggestionWords = base.split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
  return {
    kind: "deck",
    objective: truncate(base, 240),
    audience: null,
    tone: null,
    promise: truncate(base, 320),
    slides: texts.map((primaryText, index) => ({
      role: CONTROLLED_ROLES[index],
      purpose: `Slide ${index + 1} do pedido`,
      primaryText,
      secondaryText: null,
      sourceFactIds: [],
    })),
    changes: asksOnce
      ? [{
          slideIndex: 2,
          field: "secondaryText" as const,
          before: null,
          after: truncate(`${suggestionWords} na ordem do pedido`, 80),
          reason: "Controle E2E: uma sugestão rastreada para aceitar ou rejeitar.",
        }]
      : [],
  };
}

function renderPlannerUserPrompt(input: ProposeCarouselDraftInput): string {
  const factLines = input.factPack.facts.map((fact) => {
    const origin = fact.origin === "source" ? `source ${fact.sourceId ?? "?"}` : fact.origin;
    return `- [${fact.class}] "${fact.value}" (origin: ${origin})`;
  });
  const answerLines = Object.entries(input.answers).map(([field, value]) => `- ${field}: ${value}`);
  const previousSummary = input.previous?.plan
    ? JSON.stringify({
        objective: input.previous.plan.objective,
        promise: input.previous.plan.promise,
        slides: input.previous.plan.slides.map((slide) => ({
          position: slide.position,
          role: slide.role,
          primaryText: slide.primaryText,
        })),
      })
    : "(nenhum rascunho anterior)";
  return [
    `Pedido do usuário (autoridade factual integral — nunca trunque):`,
    input.request,
    "",
    "FACT PACK (as únicas afirmações permitidas):",
    factLines.length > 0 ? factLines.join("\n") : "- (nenhum fato apurado — apenas o pedido acima)",
    "",
    "Respostas já dadas pelo usuário às perguntas anteriores:",
    answerLines.length > 0 ? answerLines.join("\n") : "- (nenhuma)",
    "",
    `Tom de voz aprovado: ${input.toneOfVoice?.trim() || "(não informado)"}`,
    "",
    "Rascunho anterior do deck (revise-o; mantenha textos de slides com authority human_edit):",
    previousSummary,
    "",
    "Planeje o carrossel seguindo o contrato JSON do system prompt.",
  ].join("\n");
}

async function requestPlannerResponse(input: ProposeCarouselDraftInput): Promise<CarouselPlannerResponse> {
  let content: string | null | undefined;
  try {
    const response = await getOpenAI().chat.completions.create({
      model: env.OPENAI_TEXT_MODEL,
      messages: [
        { role: "system", content: CAROUSEL_PLANNER_SYSTEM_PROMPT },
        { role: "user", content: renderPlannerUserPrompt(input) },
      ],
      response_format: zodResponseFormat(carouselPlannerResponseSchema, "carousel_editorial_plan"),
      max_completion_tokens: 4_000,
    });
    content = response.choices[0]?.message?.content;
  } catch (error) {
    throw new CarouselEditorialPlanInvalidError(
      `carousel planner call failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!content) {
    throw new CarouselEditorialPlanInvalidError("carousel planner returned an empty response");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new CarouselEditorialPlanInvalidError(
      `carousel planner returned invalid JSON: ${(error as Error).message}`,
    );
  }
  const result = carouselPlannerResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new CarouselEditorialPlanInvalidError("carousel planner response did not match the schema");
  }
  return result.data;
}

function draftFromDeck(
  input: ProposeCarouselDraftInput,
  proposal: Extract<CarouselPlannerResponse, { kind: "deck" }>,
  mergedAnswers: Record<string, string>,
): CarouselDraftStateV1 {
  const humanByPosition = new Map<number, CarouselSlidePlanV1>();
  for (const slide of input.previous?.plan?.slides ?? []) {
    if (slide.authority === "human_edit") humanByPosition.set(slide.position, slide);
  }
  const slides: CarouselSlidePlanV1[] = proposal.slides.map((proposalSlide, index) => {
    const position = index + 1;
    const human = humanByPosition.get(position);
    const role = proposalSlide.role;
    const slide: CarouselSlidePlanV1 = {
      slideId: human ? human.slideId : stableSlideId(input.workId, position),
      position,
      role,
      purpose: proposalSlide.purpose,
      primaryText: human ? human.primaryText : proposalSlide.primaryText,
      secondaryText: human ? human.secondaryText : proposalSlide.secondaryText,
      authority: human ? "human_edit" : "ai_proposal",
      sourceFactIds: proposalSlide.sourceFactIds,
      layoutFamily: carouselLayoutFamilyForRole(role),
    };
    return slide;
  });
  const revision = `deck-${shortHash(
    input.workId,
    canonicalJsonStringify({ objective: proposal.objective, promise: proposal.promise, slides, answers: mergedAnswers }),
  )}`;
  const plan: CarouselDeckPlanV1 = {
    version: 1,
    revision,
    workId: input.workId,
    objective: proposal.objective,
    audience: proposal.audience,
    tone: proposal.tone,
    promise: proposal.promise,
    format: "4:5",
    slides,
  };
  const changes: CarouselEditorialChangeV1[] = proposal.changes.map((change, index) => ({
    id: `change-${index + 1}`,
    slideId: change.slideIndex === null ? null : stableSlideId(input.workId, change.slideIndex),
    field: change.field,
    before: change.before,
    after: change.after,
    reason: change.reason,
    status: "pending",
  }));
  return {
    version: 1,
    revision,
    answers: mergedAnswers,
    blockingQuestions: [],
    plan,
    changes,
  };
}

/**
 * One structured editorial proposal for the carousel deck: either 1-3 blocking
 * questions (plan stays null) or a 5-8 slide plan with stable slide ids.
 * Human-edited slides of the previous draft stay authoritative over new
 * proposals at the same semantic position.
 */
export async function proposeCarouselDraft(input: ProposeCarouselDraftInput): Promise<CarouselDraftStateV1> {
  const mergedAnswers = { ...(input.previous?.answers ?? {}), ...input.answers };

  if (isE2EControlledProviderEnabled()) {
    const controlled = controlledPlannerResponse(input);
    if (controlled.kind === "questions") {
      return {
        version: 1,
        revision: `questions-${shortHash(input.workId, canonicalJsonStringify(controlled.questions))}`,
        answers: mergedAnswers,
        blockingQuestions: controlled.questions,
        plan: null,
        changes: [],
      };
    }
    return draftFromDeck(input, controlled, mergedAnswers);
  }

  const response = await requestPlannerResponse(input);
  if (response.kind === "questions") {
    return {
      version: 1,
      revision: `questions-${shortHash(input.workId, canonicalJsonStringify(response.questions))}`,
      answers: mergedAnswers,
      blockingQuestions: response.questions,
      plan: null,
      changes: [],
    };
  }
  return draftFromDeck(input, response, mergedAnswers);
}
