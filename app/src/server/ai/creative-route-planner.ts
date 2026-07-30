import { z } from "zod";
import { env } from "@/server/validation/env";
import type { GenerationMode } from "@/server/generation/canonical/types";
import { extractOutputText, getOpenAI } from "./utils";
import { isE2EControlledProviderEnabled } from "./providers/e2e-controlled-provider";

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

function controlledRoutes(input: CreativeRoutePlannerInput): CreativeRoute[] {
  const objective = input.objective ?? "the stated objective";
  return normalizeCreativeRoutes({
    routes: [
      {
        id: "controlled-monument",
        thesis: `Make ${objective} immediately legible through one dominant idea`,
        visualMechanism: "single_focal_composition",
        scene: "A restrained editorial scene built around one clear focal subject",
        composition: "Dominant subject centered with deliberate negative space",
        preserve: ["brief objective", "brand identity"],
        avoid: ["generic polish", "floating interface cards"],
        renderPrompt: "A restrained editorial composition with one dominant focal subject and clear thumbnail reading.",
      },
      {
        id: "controlled-moment",
        thesis: `Show ${objective} in a concrete human context`,
        visualMechanism: "documentary_context",
        scene: "A natural, lived-in moment where the benefit is visible through action",
        composition: "Subject offset to one side with environmental depth and an open text area",
        preserve: ["brief objective", "natural materiality"],
        avoid: ["stock-photo posing", "empty studio background"],
        renderPrompt: "A candid documentary-style scene with natural light, visible action, and an honest lived-in context.",
      },
      {
        id: "controlled-proof",
        thesis: `Turn evidence for ${objective} into the visual structure`,
        visualMechanism: "physical_proof_material",
        scene: "A physical material or object makes the core proof tangible around the subject",
        composition: "Structured still life with the proof interrupting a simple visual grid",
        preserve: ["brief objective", "legible hierarchy"],
        avoid: ["generic infographic", "oversized call-to-action"],
        renderPrompt: "An editorial still life where the core proof becomes a tangible material in a structured, high-contrast composition.",
      },
    ],
  });
}

export async function planCreativeRoutes(
  input: CreativeRoutePlannerInput
): Promise<CreativeRoute[]> {
  if (isE2EControlledProviderEnabled()) return controlledRoutes(input);

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
