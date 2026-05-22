import OpenAI from "openai";
import { env } from "@/server/validation/env";

function getOpenAI() {
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

export interface CreativeDiagnosis {
  detectedConcept: string;
  elementsToPreserve: string[];
  variationOpportunities: string[];
}

export interface CreativeDiagnosisResult {
  diagnosis: CreativeDiagnosis;
  status: "ready" | "failed";
  source: "ai" | "edited" | "regenerated";
}

export interface AnalyzeCreativeDiagnosisInput {
  campaign: {
    name: string;
    client: string | null;
    product: string | null;
    objective: string | null;
    audience: string | null;
    platforms: string[] | null;
    tone: string | null;
    offer: string | null;
    constraints: string | null;
    notes: string | null;
    ctaVariants: string[] | null;
  };
  imageBuffer: Buffer;
  mimeType: string;
  locale?: string;
}

function languageInstruction(locale?: string): string {
  if (locale === "pt-BR") {
    return "\n\nResponda inteiramente em português brasileiro (pt-BR).";
  }
  return "";
}

export function buildCreativeDiagnosisPrompt(
  campaign: AnalyzeCreativeDiagnosisInput["campaign"],
  locale?: string
): string {
  return `You are a senior creative director analyzing an advertising campaign brief and its reference image.

Analyze the campaign and the reference image to produce a lightweight creative diagnosis.

Campaign:
- Name: ${campaign.name}
- Client/Product: ${campaign.client || campaign.product || "N/A"}
- Objective: ${campaign.objective || "N/A"}
- Audience: ${campaign.audience || "N/A"}
- Platforms: ${campaign.platforms?.join(", ") || "N/A"}
- Tone: ${campaign.tone || "N/A"}
- Offer: ${campaign.offer || "N/A"}
- Constraints: ${campaign.constraints || "None"}
- Notes: ${campaign.notes || "None"}
- CTAs: ${campaign.ctaVariants?.join(", ") || "N/A"}

Return ONLY a JSON object with this exact structure:
{
  "detectedConcept": "string — what the current creative appears to communicate",
  "elementsToPreserve": ["string", ...],
  "variationOpportunities": ["string", ...]
}

Rules:
- detectedConcept: a concise paragraph describing the core creative concept.
- elementsToPreserve: include every visible information-bearing element that must remain intact across variations: exact headline copy, offer, price/discount, CTA, product/service, logo/brand cues, legal or small-print text, faces, products, badges, and any important edge-aligned elements.
- When visible text is legible, quote it verbatim inside elementsToPreserve instead of summarizing it.
- variationOpportunities: concrete directions the model can explore for stronger variations, focused on hierarchy, spacing, grouping, background, and composition changes that do not remove or crop required information.
- Include at least one opportunity about rearranging crowded elements more cleanly when the reference ad is dense.
- Do not invent facts not supported by the briefing or image.
- Keep each array to 4–8 items when enough information is visible.${languageInstruction(locale)}`;
}

export function normalizeCreativeDiagnosis(
  raw: unknown
): CreativeDiagnosis | null {
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;

  const detectedConcept =
    typeof obj.detectedConcept === "string" ? obj.detectedConcept.trim() : "";

  const elementsToPreserve = Array.isArray(obj.elementsToPreserve)
    ? obj.elementsToPreserve
        .filter((item): item is string => typeof item === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

  const variationOpportunities = Array.isArray(obj.variationOpportunities)
    ? obj.variationOpportunities
        .filter((item): item is string => typeof item === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

  if (!detectedConcept && elementsToPreserve.length === 0 && variationOpportunities.length === 0) {
    return null;
  }

  return {
    detectedConcept,
    elementsToPreserve,
    variationOpportunities,
  };
}

export async function analyzeCreativeDiagnosis(
  input: AnalyzeCreativeDiagnosisInput
): Promise<CreativeDiagnosisResult> {
  const base64 = input.imageBuffer.toString("base64");
  const dataUrl = `data:${input.mimeType};base64,${base64}`;

  const prompt = buildCreativeDiagnosisPrompt(input.campaign, input.locale);

  const response = await getOpenAI().responses.create({
    model: env.OPENAI_TEXT_MODEL,
    input: [
      { role: "system", content: "You are an expert creative director diagnosing ad creatives." },
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_object",
      },
    },
  });

  const raw = (response as unknown as { output_text?: string }).output_text;
  if (!raw) {
    throw new Error("Empty response for creative diagnosis");
  }

  const parsed = JSON.parse(raw) as unknown;
  const diagnosis = normalizeCreativeDiagnosis(parsed);

  if (!diagnosis) {
    throw new Error("Malformed creative diagnosis response");
  }

  return {
    diagnosis,
    status: "ready",
    source: "ai",
  };
}
