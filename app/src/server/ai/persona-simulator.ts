import { z } from "zod";
import { env } from "@/server/validation/env";
import { getOpenAI, extractOutputText } from "./utils";

const personaResultSchema = z.object({
  understands: z.string().min(1),
  rejects: z.string().min(1),
  wants: z.string().min(1),
  wouldClick: z.boolean(),
  rationale: z.string().min(1),
});

const personaSimulationResultsSchema = z.object({
  skeptical_buyer: personaResultSchema,
  warm_lead: personaResultSchema,
  financial_decision_maker: personaResultSchema,
  beginner: personaResultSchema,
});

export interface PersonaResult {
  understands: string;
  rejects: string;
  wants: string;
  wouldClick: boolean;
  rationale: string;
}

export interface PersonaSimulationResults {
  skeptical_buyer: PersonaResult;
  warm_lead: PersonaResult;
  financial_decision_maker: PersonaResult;
  beginner: PersonaResult;
}

export interface SimulatePersonasInput {
  campaign: {
    objective: string;
    audience: string;
    offer: string;
    ctaText?: string | null;
    tone?: string | null;
    constraints?: string | null;
    clientName?: string | null;
    productName?: string | null;
  };
  creative: {
    type: "derivation" | "landing_page";
    description: string;
  };
  locale: "pt-BR" | "en";
}

function stripCodeFence(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) return match[1].trim();
  return text.trim();
}

export function buildPersonaSimulationPrompt(input: SimulatePersonasInput): string {
  const isPt = input.locale === "pt-BR";
  const language = isPt ? "português brasileiro" : "English";

  const personaLabels = isPt
    ? {
        skeptical_buyer: "Comprador Cético",
        warm_lead: "Lead Aquecido",
        financial_decision_maker: "Decisor Financeiro",
        beginner: "Iniciante",
      }
    : {
        skeptical_buyer: "Skeptical Buyer",
        warm_lead: "Warm Lead",
        financial_decision_maker: "Financial Decision Maker",
        beginner: "Beginner",
      };

  const sections = [
    isPt
      ? "Você é um especialista em comportamento do consumidor. Analise a peça criativa abaixo através de 4 personas distintas."
      : "You are a consumer behavior expert. Analyze the creative below through 4 distinct personas.",
    "",
    isPt ? "RESUMO DA CAMPANHA:" : "CAMPAIGN BRIEF:",
    `- ${isPt ? "Objetivo" : "Objective"}: ${input.campaign.objective}`,
    `- ${isPt ? "Público" : "Audience"}: ${input.campaign.audience}`,
    `- ${isPt ? "Oferta" : "Offer"}: ${input.campaign.offer}`,
    `- ${isPt ? "Tom de voz" : "Tone"}: ${input.campaign.tone ?? (isPt ? "não especificado" : "not specified")}`,
    `- ${isPt ? "Restrições" : "Constraints"}: ${input.campaign.constraints ?? (isPt ? "nenhuma" : "none")}`,
    `- ${isPt ? "Cliente" : "Client"}: ${input.campaign.clientName ?? (isPt ? "não especificado" : "not specified")}`,
    `- ${isPt ? "Produto" : "Product"}: ${input.campaign.productName ?? (isPt ? "não especificado" : "not specified")}`,
    `- CTA: ${input.campaign.ctaText ?? (isPt ? "não especificado" : "not specified")}`,
    "",
    isPt ? "PEÇA CRIATIVA:" : "CREATIVE:",
    `- ${isPt ? "Tipo" : "Type"}: ${input.creative.type}`,
    `- ${isPt ? "Descrição" : "Description"}: ${input.creative.description}`,
    "",
    isPt ? "INSTRUÇÕES:" : "INSTRUCTIONS:",
    isPt
      ? "Para cada persona, responda em 2-3 frases curtas por campo."
      : "For each persona, answer in 2-3 short sentences per field.",
    isPt
      ? `Personas a analisar: ${personaLabels.skeptical_buyer}, ${personaLabels.warm_lead}, ${personaLabels.financial_decision_maker}, ${personaLabels.beginner}`
      : `Personas to analyze: ${personaLabels.skeptical_buyer}, ${personaLabels.warm_lead}, ${personaLabels.financial_decision_maker}, ${personaLabels.beginner}`,
    "",
    isPt ? "RETORNE APENAS JSON com a estrutura exata:" : "Return ONLY JSON with the exact structure:",
    JSON.stringify(
      {
        skeptical_buyer: {
          understands: "string",
          rejects: "string",
          wants: "string",
          wouldClick: true,
          rationale: "string",
        },
        warm_lead: {
          understands: "string",
          rejects: "string",
          wants: "string",
          wouldClick: true,
          rationale: "string",
        },
        financial_decision_maker: {
          understands: "string",
          rejects: "string",
          wants: "string",
          wouldClick: true,
          rationale: "string",
        },
        beginner: {
          understands: "string",
          rejects: "string",
          wants: "string",
          wouldClick: true,
          rationale: "string",
        },
      },
      null,
      2
    ),
    "",
    `${isPt ? "Idioma" : "Language"}: ${language}`,
  ];

  return sections.join("\n");
}

export function normalizePersonaSimulationResults(raw: unknown): PersonaSimulationResults {
  const parsed = personaSimulationResultsSchema.safeParse(raw);

  if (parsed.success) {
    return parsed.data;
  }

  const fallback: PersonaResult = {
    understands: "",
    rejects: "",
    wants: "",
    wouldClick: false,
    rationale: "",
  };

  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  function normalizePersona(value: unknown): PersonaResult {
    if (!value || typeof value !== "object") return fallback;
    const v = value as Record<string, unknown>;
    return {
      understands: typeof v.understands === "string" ? v.understands : "",
      rejects: typeof v.rejects === "string" ? v.rejects : "",
      wants: typeof v.wants === "string" ? v.wants : "",
      wouldClick: typeof v.wouldClick === "boolean" ? v.wouldClick : false,
      rationale: typeof v.rationale === "string" ? v.rationale : "",
    };
  }

  return {
    skeptical_buyer: normalizePersona(input.skeptical_buyer),
    warm_lead: normalizePersona(input.warm_lead),
    financial_decision_maker: normalizePersona(input.financial_decision_maker),
    beginner: normalizePersona(input.beginner),
  };
}

export async function simulatePersonas(
  input: SimulatePersonasInput
): Promise<PersonaSimulationResults> {
  const response = await getOpenAI().responses.create({
    model: env.OPENAI_TEXT_MODEL,
    input: [
      {
        role: "system",
        content: "You are a consumer behavior expert that returns JSON only.",
      },
      {
        role: "user",
        content: buildPersonaSimulationPrompt(input),
      },
    ],
    text: { format: { type: "json_object" } },
  });

  const raw = extractOutputText(response);
  if (!raw) throw new Error("Empty response from persona simulator");

  const parsed = JSON.parse(stripCodeFence(raw));
  return normalizePersonaSimulationResults(parsed);
}
