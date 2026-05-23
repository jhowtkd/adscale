import { env } from "@/server/validation/env";
import { getOpenAI, extractOutputText } from "./utils";

export type LandingPageSectionKey =
  | "hero"
  | "problem"
  | "solution"
  | "benefits"
  | "trust"
  | "offer"
  | "faq"
  | "finalCta";

export interface LandingPageSection {
  eyebrow?: string;
  headline: string;
  body: string;
  bullets?: string[];
  cta?: string;
  items?: Array<{ question: string; answer: string }>;
}

export interface LandingPageStructure {
  title: string;
  sections: Record<LandingPageSectionKey, LandingPageSection>;
}

const REQUIRED_SECTIONS: LandingPageSectionKey[] = [
  "hero",
  "problem",
  "solution",
  "benefits",
  "trust",
  "offer",
  "faq",
  "finalCta",
];

export function buildLandingPagePrompt(
  campaign: {
    name: string;
    client?: string | null;
    product?: string | null;
    objective?: string | null;
    audience?: string | null;
    offer?: string | null;
    tone?: string | null;
    constraints?: string | null;
    notes?: string | null;
    ctaVariants?: string[] | null;
  },
  derivationContext: {
    prompt?: string | null;
    ctaText?: string | null;
    format?: string | null;
  }
): string {
  const parts: string[] = [
    "You are a landing page copywriter. Generate a structured landing page from the approved creative and campaign brief.",
    "",
    "CAMPAIGN BRIEF:",
    `- Name: ${campaign.name}`,
    `- Client: ${campaign.client || "N/A"}`,
    `- Product: ${campaign.product || "N/A"}`,
    `- Objective: ${campaign.objective || "N/A"}`,
    `- Audience: ${campaign.audience || "N/A"}`,
    `- Offer: ${campaign.offer || "N/A"}`,
    `- Tone: ${campaign.tone || "N/A"}`,
    `- Constraints: ${campaign.constraints || "None"}`,
    `- Notes: ${campaign.notes || "N/A"}`,
    `- CTA Variants: ${campaign.ctaVariants?.join(", ") || "N/A"}`,
    "",
    "APPROVED CREATIVE CONTEXT:",
    `- Derivation Prompt: ${derivationContext.prompt || "N/A"}`,
    `- CTA Text: ${derivationContext.ctaText || "N/A"}`,
    `- Format: ${derivationContext.format || "N/A"}`,
    "",
    "INSTRUCTIONS:",
    "Return ONLY a JSON object with this exact structure:",
    JSON.stringify({
      title: "string",
      sections: {
        hero: { eyebrow: "string (optional)", headline: "string", body: "string", cta: "string" },
        problem: { headline: "string", body: "string", bullets: ["string"] },
        solution: { headline: "string", body: "string", bullets: ["string"] },
        benefits: { headline: "string", body: "string", bullets: ["string"] },
        trust: { headline: "string", body: "string" },
        offer: { headline: "string", body: "string", cta: "string" },
        faq: { headline: "string", items: [{ question: "string", answer: "string" }] },
        finalCta: { headline: "string", body: "string", cta: "string" },
      },
    }, null, 2),
    "",
    "RULES:",
    "- Do not invent testimonials, guarantees, legal claims, or unavailable discounts.",
    "- Do not require fake proof or social proof that does not exist in the brief.",
    "- Use only the campaign offer and constraints as the source of truth.",
    "- Keep copy persuasive but truthful and aligned with the brief.",
    "- All fields are required unless marked optional.",
  ];

  return parts.join("\n");
}

export function normalizeLandingPageStructure(value: unknown): LandingPageStructure {
  const input = (value && typeof value === "object" ? value : {}) as {
    title?: unknown;
    sections?: Record<string, unknown>;
  };

  const title = typeof input.title === "string" && input.title.trim().length > 0
    ? input.title.trim()
    : "Landing Page";

  const sections = {} as Record<LandingPageSectionKey, LandingPageSection>;

  for (const key of REQUIRED_SECTIONS) {
    const raw = input.sections?.[key];
    const section = (raw && typeof raw === "object" ? raw : {}) as {
      eyebrow?: unknown;
      headline?: unknown;
      body?: unknown;
      bullets?: unknown;
      cta?: unknown;
      items?: unknown;
    };

    sections[key] = {
      eyebrow: typeof section.eyebrow === "string" ? section.eyebrow.trim() : undefined,
      headline: typeof section.headline === "string" && section.headline.trim().length > 0
        ? section.headline.trim()
        : key === "hero" ? "Welcome" : key,
      body: typeof section.body === "string" && section.body.trim().length > 0
        ? section.body.trim()
        : "",
      bullets: Array.isArray(section.bullets)
        ? section.bullets.filter((b): b is string => typeof b === "string" && b.trim().length > 0)
        : undefined,
      cta: typeof section.cta === "string" ? section.cta.trim() : undefined,
      items: Array.isArray(section.items)
        ? section.items
            .filter((item): item is { question: string; answer: string } => {
              return (
                item &&
                typeof item === "object" &&
                typeof (item as { question?: unknown }).question === "string" &&
                typeof (item as { answer?: unknown }).answer === "string"
              );
            })
            .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() }))
        : undefined,
    };
  }

  return { title, sections };
}

function stripCodeFence(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) return match[1].trim();
  return text.trim();
}

export async function generateLandingPageStructure(
  campaign: {
    name: string;
    client?: string | null;
    product?: string | null;
    objective?: string | null;
    audience?: string | null;
    offer?: string | null;
    tone?: string | null;
    constraints?: string | null;
    notes?: string | null;
    ctaVariants?: string[] | null;
  },
  derivationContext: {
    prompt?: string | null;
    ctaText?: string | null;
    format?: string | null;
  }
): Promise<LandingPageStructure> {
  const response = await getOpenAI().responses.create({
    model: env.OPENAI_TEXT_MODEL,
    input: [
      {
        role: "system",
        content: "You are a landing page copywriter that returns JSON only.",
      },
      {
        role: "user",
        content: buildLandingPagePrompt(campaign, derivationContext),
      },
    ],
    text: { format: { type: "json_object" } },
  });

  const raw = extractOutputText(response);
  if (!raw) throw new Error("Empty response from landing page generator");

  const parsed = JSON.parse(stripCodeFence(raw));
  return normalizeLandingPageStructure(parsed);
}
