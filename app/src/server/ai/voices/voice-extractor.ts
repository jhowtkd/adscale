import "server-only";

import { z } from "zod";

import type { OlharVoiceConfigPayload } from "@/server/db/schema";
import { env } from "@/server/validation/env";
import { getOpenAI } from "../utils";

/**
 * Output schema for voice extraction. Mirrors {@link OlharVoiceConfigPayload}
 * — the exact shape consumed by `buildClientVoiceFromConfig` and stored in
 * `client_profile_olhar_config.config`. Producing this shape directly means the
 * result is injectable into the prompt as soon as the user approves it, with no
 * adapter layer.
 *
 * `matchTerms` is omitted from the schema: it is brand-name-derived metadata
 * the user is better placed to supply (or leave empty) than the model.
 */
const voiceExtractionSchema = z.object({
  principles: z
    .array(z.string())
    .min(1)
    .describe("Core editorial and communication principles that define this brand's voice"),
  positiveSignals: z
    .array(z.string())
    .min(1)
    .describe("Signals that a creative is on-brand and on-voice"),
  negativeSignals: z
    .array(z.string())
    .min(1)
    .describe("Signals that a creative is off-brand or off-voice and should be rejected"),
  authorityAndClaims: z
    .array(z.string())
    .min(1)
    .describe("Rules for how authority cues, credentials and claims may (and may not) be used"),
  inviteRhythm: z
    .array(z.string())
    .min(1)
    .describe("How calls-to-action and invites should read and land rhythmically"),
  correctButSoulless: z
    .array(z.string())
    .min(1)
    .describe("Ways a creative can be factually/export-clean yet still fail this brand's voice"),
});

export type ExtractedBrandVoice = z.infer<typeof voiceExtractionSchema>;

const VOICE_EXTRACTION_SYSTEM_PROMPT = `You are a brand voice analyst. Given a brand's tone-of-voice notes, constraints, and descriptions of its example creatives, distill a structured voice profile.
Return ONLY a JSON object with this exact structure:
{
  "principles": ["...", "..."],
  "positiveSignals": ["...", "..."],
  "negativeSignals": ["...", "..."],
  "authorityAndClaims": ["...", "..."],
  "inviteRhythm": ["...", "..."],
  "correctButSoulless": ["...", "..."]
}

Each array MUST contain at least one concrete, actionable statement derived from the provided brand inputs.
- Principles: the editorial and communication stance that makes this brand recognisable.
- Positive signals: specific traits a creative should embody to feel on-voice.
- Negative signals: specific traits to reject because they feel off-voice or generic.
- Authority and claims: how credentials, proof and claims may be used (and where invention is forbidden).
- Invite rhythm: how the call-to-action should read and close the reading path.
- Correct but soulless: ways a piece can be export-clean yet still fail this brand's voice.

Be concrete and grounded in the provided inputs. Do not invent facts, credentials, or claims the brand has not supplied. Do not reference any other brand. Do not default to a generic "growth-template" voice.`;

export interface ExtractVoiceFromBrandInputsInput {
  /** Free-form tone of voice description (e.g. extracted from a brand guide). */
  toneOfVoice?: string | null;
  /** Visual direction notes attached to the profile. */
  visualNotes?: string | null;
  /** Tone notes attached to the profile. */
  toneNotes?: string | null;
  /** Explicit brand constraints / dos and don'ts. */
  constraints?: string | null;
  /** Optional human-authored captions describing example creatives. */
  creativeDescriptions?: string[];
}

/**
 * Produce a proposed voice profile ({@link OlharVoiceConfigPayload}-compatible)
 * from a brand's textual inputs. Mirrors the architecture of
 * `extractBrandKitFromImage` (chat completion → JSON → zod-safeParse → return),
 * but conditioned on text rather than a vision input — tone of voice is textual
 * inference, not visual.
 *
 * The caller is responsible for credit charging (idempotency-keyed) and for
 * persisting the result as a `pending_review` voice config.
 */
export async function extractVoiceFromBrandInputs(
  input: ExtractVoiceFromBrandInputsInput,
): Promise<ExtractedBrandVoice> {
  const prompt = buildVoiceExtractionUserPrompt(input);

  const response = await getOpenAI().chat.completions.create({
    model: env.OPENAI_TEXT_MODEL,
    messages: [
      { role: "system", content: VOICE_EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: 2048,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty response for brand voice extraction");
  }

  const jsonString = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/, "$1").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        throw new Error("Failed to parse brand voice extraction response. The AI returned invalid JSON. Please try again.");
      }
    } else {
      throw new Error("Failed to parse brand voice extraction response. The AI returned invalid JSON. Please try again.");
    }
  }

  const validated = voiceExtractionSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Brand voice extraction validation failed: ${validated.error.message}`);
  }

  return validated.data;
}

/**
 * Convert an extracted voice into the persistence payload shape, adding an
 * empty `matchTerms` so the result satisfies {@link OlharVoiceConfigPayload}
 * directly.
 */
export function toOlharVoiceConfigPayload(
  extracted: ExtractedBrandVoice,
): OlharVoiceConfigPayload {
  return { ...extracted, matchTerms: [] };
}

function buildVoiceExtractionUserPrompt(input: ExtractVoiceFromBrandInputsInput): string {
  const sections: string[] = [];

  if (input.toneOfVoice && input.toneOfVoice.trim()) {
    sections.push(`Tone of voice:\n${input.toneOfVoice.trim()}`);
  }
  if (input.visualNotes && input.visualNotes.trim()) {
    sections.push(`Visual direction:\n${input.visualNotes.trim()}`);
  }
  if (input.toneNotes && input.toneNotes.trim()) {
    sections.push(`Tone notes:\n${input.toneNotes.trim()}`);
  }
  if (input.constraints && input.constraints.trim()) {
    sections.push(`Constraints (dos and don'ts):\n${input.constraints.trim()}`);
  }
  if (input.creativeDescriptions && input.creativeDescriptions.length > 0) {
    const list = input.creativeDescriptions
      .map((d, i) => `${i + 1}. ${d}`)
      .join("\n");
    sections.push(`Example creative descriptions:\n${list}`);
  }

  if (sections.length === 0) {
    throw new Error(
      "Cannot extract a brand voice without at least one textual input (tone of voice, notes, constraints, or creative descriptions).",
    );
  }

  return [
    "Distill the structured voice profile from the following brand inputs.",
    "Ground every statement in what is provided — do not invent credentials or claims.",
    "",
    sections.join("\n\n"),
  ].join("\n");
}
