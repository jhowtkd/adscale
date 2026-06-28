import { z } from "zod";
import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById, updateCampaign } from "@/server/repositories/campaign";
import { getOpenAI } from "@/server/ai/utils";
import { zodResponseFormat } from "openai/helpers/zod";
import { logger } from "@/lib/logger";

const suggestCtasSchema = z.object({
  campaignContext: z.object({
    product: z.string().optional(),
    objective: z.string().optional(),
    targetAudience: z.string().optional(),
    tone: z.string().optional(),
    offer: z.string().optional(),
    platforms: z.array(z.string()).optional(),
  }),
  existingCtas: z.array(z.string()).max(3).optional(),
});

const CtaSuggestionsResponseSchema = z.object({
  suggestions: z.array(z.object({
    value: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
  })).max(3),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const rateLimitResult = await checkRateLimit(request, { category: "ai", workspaceId: workspace.id });
    if (rateLimitResult) return rateLimitResult;

    // Verify campaign exists and belongs to workspace
    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const body = await request.json();
    const parsed = suggestCtasSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const { campaignContext, existingCtas } = parsed.data;

    // Check cache first (stored in platformSpecificNotes)
    const notes = campaign.platformSpecificNotes as Record<string, unknown> | null;
    const cachedSuggestions = notes?._ctaSuggestions;
    if (cachedSuggestions && Array.isArray(cachedSuggestions)) {
      return apiSuccess({ suggestions: cachedSuggestions });
    }

    // Generate CTA suggestions using OpenAI
    const suggestions = await generateCtaSuggestions(campaignContext, existingCtas);

    // Cache suggestions in campaign metadata
    const currentNotes = (campaign.platformSpecificNotes ?? {}) as Record<string, unknown>;
    await updateCampaign(campaignId, workspace.id, {
      platformSpecificNotes: {
        ...currentNotes,
        _ctaSuggestions: suggestions,
      },
    });

    return apiSuccess({ suggestions });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].suggest-ctas.POST");
  }
}

async function generateCtaSuggestions(
  context: {
    product?: string;
    objective?: string;
    targetAudience?: string;
    tone?: string;
    offer?: string;
    platforms?: string[];
  },
  existingCtas?: string[]
): Promise<Array<{ value: string; confidence: "high" | "medium" | "low" }>> {
  const platformList = context.platforms?.join(", ") ?? "digital advertising";
  const existingCtasText = existingCtas?.length
    ? `Existing CTAs to avoid duplicating: ${existingCtas.join(", ")}`
    : "";

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "system",
        content: `You are an expert copywriter specializing in advertising calls-to-action (CTAs) for the Brazilian market.

Generate compelling, action-oriented CTA suggestions in Portuguese (Brazilian) based on the campaign context provided.

Guidelines:
- CTAs should be concise (2-4 words ideally, max 6 words)
- Match the tone and target audience
- Consider the offer/promotion if mentioned
- Be platform-aware (different platforms may need different approaches)
- Use action verbs: Compre, Aproveite, Descubra, Saiba, Cadastre-se, Experimente, Garanta
- Return exactly 3 suggestions ordered by relevance
- Assign confidence based on how well the CTA matches the context

Return as structured JSON with an array of suggestions, each with "value" and "confidence" fields.`,
      },
      {
        role: "user",
        content: `Generate 3 CTA suggestions for this campaign:

Product: ${context.product ?? "Not specified"}
Objective: ${context.objective ?? "Not specified"}
Target Audience: ${context.targetAudience ?? "Not specified"}
Tone: ${context.tone ?? "Not specified"}
Offer: ${context.offer ?? "Not specified"}
Platforms: ${platformList}

${existingCtasText}

Return only valid JSON matching the schema.`,
      },
    ],
    response_format: zodResponseFormat(CtaSuggestionsResponseSchema, "cta_suggestions"),
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return getDefaultSuggestions();
  }

  try {
    const parsed = JSON.parse(content);
    const validated = CtaSuggestionsResponseSchema.parse(parsed);
    return validated.suggestions;
  } catch (error) {
    logger.error("[suggest-ctas] failed to parse AI response", { error });
    return getDefaultSuggestions();
  }
}

function getDefaultSuggestions(): Array<{ value: string; confidence: "high" | "medium" | "low" }> {
  return [
    { value: "Compre Agora", confidence: "high" },
    { value: "Saiba Mais", confidence: "medium" },
    { value: "Aproveite a Oferta", confidence: "medium" },
  ];
}
