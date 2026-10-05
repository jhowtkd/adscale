import OpenAI from "openai";
import "server-only";
import { z } from "zod";
import { env } from "@/server/validation/env";

let _openai: OpenAI | undefined;

export function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000 });
  }
  return _openai;
}

/**
 * The lowest reasoning level each OpenAI model family accepts, or undefined when the field must be omitted.
 * A prefix check alone sent nothing to gpt-5-mini, which then spent the whole token budget reasoning and
 * answered empty (ticket 22). Measured against the API on 2026-10-05:
 * - gpt-6* accepts "none" ("minimal" is a 400); gpt-5.6* already used "none".
 * - gpt-5, gpt-5-mini and gpt-5-nano accept "minimal" (0 reasoning tokens on gpt-5-mini).
 * - Anything else (gpt-4o, gpt-4.1, …) does not take the field.
 */
export function lowestReasoningEffort(model: string): OpenAI.ReasoningEffort | undefined {
  if (/^gpt-6(?:[.-]|$)/.test(model) || /^gpt-5\.6(?:[.-]|$)/.test(model)) return "none";
  if (/^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/.test(model)) return "minimal";
  return undefined;
}

const outputTextSchema = z.object({
  output_text: z.string().optional(),
});

export function extractOutputText(response: unknown): string | undefined {
  const parsed = outputTextSchema.safeParse(response);
  return parsed.success ? parsed.data.output_text : undefined;
}
