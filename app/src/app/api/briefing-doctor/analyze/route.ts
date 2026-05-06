import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getUserLocale } from "@/server/repositories/user";
import { env } from "@/server/validation/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const fieldSchema = z.enum([
  "objective",
  "audience",
  "offer",
  "constraints",
  "notes",
  "targetFormat",
  "ctaVariants",
]);

const briefingSchema = z.object({
  name: z.string().min(1),
  client: z.string().min(1),
  objective: z.string().optional().default(""),
  audience: z.string().optional().default(""),
  platforms: z.array(z.string()).optional().default([]),
  tone: z.string().optional().default(""),
  offer: z.string().optional().default(""),
  constraints: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  generationMode: z.enum(["art_variation", "format_adaptation"]),
  creativeLevel: z.enum(["conservative", "balanced", "bold"]),
  targetFormat: z.string().optional().default(""),
  ctaVariants: z.array(z.string()).max(3).optional().default([]),
});

const bodySchema = z.object({
  briefing: briefingSchema,
});

const issueSchema = z.object({
  field: fieldSchema,
  severity: z.enum(["low", "medium", "high"]),
  message: z.string(),
  impact: z.string(),
});

const suggestionSchema = z.object({
  field: fieldSchema,
  title: z.string(),
  suggestedValue: z.union([z.string(), z.array(z.string())]),
  rationale: z.string(),
});

const analysisSchema = z.object({
  overallScore: z.number().min(0).max(100),
  readiness: z.enum(["ready", "needs_attention", "weak"]),
  issues: z.array(issueSchema),
  suggestions: z.array(suggestionSchema),
  improvedBrief: z.record(z.unknown()).default({}),
  fieldPatches: z.array(z.object({
    field: fieldSchema,
    value: z.union([z.string(), z.array(z.string())]),
  })),
});

const validFormats = new Set(["1:1", "4:5", "9:16"]);

function buildPrompt(briefing: z.infer<typeof briefingSchema>, locale: string) {
  return [
    "You are Briefing Doctor, an advertising briefing reviewer for an image generation product.",
    "Review the briefing and return only JSON.",
    `User locale: ${locale}. Respond in this locale.`,
    "Do not invent factual discounts, deadlines, claims, guarantees, or benefits.",
    "Do not overwrite existing CTA text. CTA ideas are alternatives only.",
    "Allowed target formats: 1:1, 4:5, 9:16.",
    "Do not silently change generationMode.",
    "",
    `Briefing: ${JSON.stringify(briefing)}`,
    "",
    "Return exactly: overallScore, readiness, issues, suggestions, improvedBrief, fieldPatches.",
  ].join("\n");
}

function sanitizeAnalysis(raw: unknown) {
  const parsed = analysisSchema.parse(raw);
  return {
    ...parsed,
    fieldPatches: parsed.fieldPatches.filter((patch) => {
      if (patch.field !== "targetFormat") return true;
      const value = Array.isArray(patch.value) ? patch.value[0] : patch.value;
      return validFormats.has(value);
    }),
    suggestions: parsed.suggestions.filter((suggestion) => {
      if (suggestion.field !== "targetFormat") return true;
      const value = Array.isArray(suggestion.suggestedValue)
        ? suggestion.suggestedValue[0]
        : suggestion.suggestedValue;
      return validFormats.has(value);
    }),
  };
}

export async function POST(request: Request) {
  try {
    const { user } = await requireWorkspaceAccess(request);
    const locale = await getUserLocale(user.id);
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const response = await openai.responses.create({
      model: env.OPENAI_TEXT_MODEL,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: buildPrompt(parsed.data.briefing, locale) }],
        },
      ],
      text: {
        format: { type: "json_object" },
      },
    });

    const raw = response.output_text;
    if (!raw) {
      return apiError("briefingDoctorFailed", 502);
    }

    try {
      const json = JSON.parse(raw);
      const analysis = sanitizeAnalysis(json);
      return NextResponse.json({ analysis });
    } catch {
      return apiError("briefingDoctorFailed", 502);
    }
  } catch (error) {
    return handleApiError(error, "briefing-doctor.analyze.POST");
  }
}
