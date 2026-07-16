import { z } from "zod";
import { env } from "@/server/validation/env";
import type { GenerationMode } from "@/server/generation/canonical/types";
import { extractOutputText, getOpenAI } from "./utils";

const creativeRouteSchema = z.object({
  id: z.string().min(1),
  thesis: z.string().min(1),
  visualMechanism: z.string().min(1),
  scene: z.string().min(1),
  composition: z.string().min(1),
  preserve: z.array(z.string().min(1)).max(6),
  avoid: z.array(z.string().min(1)).max(6),
  renderPrompt: z.string().min(1),
});

const creativeRoutesSchema = z.object({
  routes: z.array(creativeRouteSchema).length(3),
});

export type CreativeRoute = z.infer<typeof creativeRouteSchema>;
export type CreativeRoutePlannerInput = {
  sourcePrompt: string;
  objective: string | null;
  mode: GenerationMode;
  referenceNames: string[];
};

export function normalizeCreativeRoutes(value: unknown): CreativeRoute[] {
  const routes = creativeRoutesSchema.parse(value).routes;
  const mechanisms = new Set(
    routes.map((route) => route.visualMechanism.trim().toLowerCase())
  );
  if (mechanisms.size !== routes.length) {
    throw new Error("Creative routes must use distinct visual mechanisms");
  }
  return routes.map((route, index) => ({ ...route, id: `route-${index + 1}` }));
}

export function buildCreativeRoutePlannerPrompt(input: CreativeRoutePlannerInput): string {
  const references = input.referenceNames.length
    ? input.referenceNames.map((name, index) => `Image ${index + 1}: ${name}`).join("\n")
    : "(no reference images)";

  return `Create exactly three executable art-direction routes for one paid-social creative.
Each route must use a different visual mechanism, not merely a different color, background, or intensity.
Prefer a clear dominant idea, brand specificity, natural materiality, and strong thumbnail reading.
Avoid generic AI-ad tropes such as neon glow, floating UI cards, oversized CTA buttons, and empty polish.

MODE: ${input.mode}
OBJECTIVE: ${input.objective ?? "Not provided"}

REFERENCE MANIFEST:
${references}

SOURCE CONTRACT:
${input.sourcePrompt}`;
}

export async function planCreativeRoutes(
  input: CreativeRoutePlannerInput
): Promise<CreativeRoute[]> {
  const response = await getOpenAI().responses.create(
    {
      model: env.OPENAI_TEXT_MODEL,
      input: [
        {
          role: "system",
          content: "You are a senior art director creating distinct, executable visual routes.",
        },
        { role: "user", content: buildCreativeRoutePlannerPrompt(input) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "creative_routes",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              routes: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    thesis: { type: "string" },
                    visualMechanism: { type: "string" },
                    scene: { type: "string" },
                    composition: { type: "string" },
                    preserve: { type: "array", items: { type: "string" }, maxItems: 6 },
                    avoid: { type: "array", items: { type: "string" }, maxItems: 6 },
                    renderPrompt: { type: "string" },
                  },
                  required: [
                    "id",
                    "thesis",
                    "visualMechanism",
                    "scene",
                    "composition",
                    "preserve",
                    "avoid",
                    "renderPrompt",
                  ],
                },
              },
            },
            required: ["routes"],
          },
        },
      },
    },
    { timeout: 180_000, maxRetries: 0 }
  );

  const raw = extractOutputText(response);
  if (!raw) throw new Error("Empty creative route response");
  return normalizeCreativeRoutes(JSON.parse(raw));
}
