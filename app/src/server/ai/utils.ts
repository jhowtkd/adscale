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
 * The lowest reasoning level a model accepts on chat.completions, or undefined when the field must be omitted.
 * A prefix check alone sent nothing to gpt-5-mini, which then spent the whole token budget reasoning and
 * answered empty (ticket 22). Each value below was measured against the API on 2026-10-05; a wrong one is a 400:
 * - "none": gpt-6-luna, gpt-6-sol, gpt-5.1, gpt-5.2, gpt-5.5 and gpt-5.6-* ("minimal" is a 400 on all of them).
 * - "minimal": gpt-5, gpt-5-mini and gpt-5-nano ("none" is a 400).
 * - "low": gpt-6.1-sol, gpt-6-astra, o3 and o4-mini reject both "none" and "minimal". "low" is also the only
 *   value every measured reasoning model accepted, so an unmeasured gpt-5.x / gpt-6* / o* model gets it.
 * - Non-reasoning models (gpt-4o, gpt-4.1, …) reject the field.
 */
export function lowestReasoningEffort(model: string): OpenAI.ReasoningEffort | undefined {
  const snapshot = "(?:-\\d{4}-\\d{2}-\\d{2})?$";
  if (new RegExp(`^(?:gpt-6-(?:luna|sol)|gpt-5\\.(?:1|2|5)|gpt-5\\.6(?:-[a-z]+)?)${snapshot}`).test(model)) return "none";
  if (new RegExp(`^gpt-5(?:-mini|-nano)?${snapshot}`).test(model)) return "minimal";
  if (/^(?:gpt-5\.\d|gpt-6(?:[.-]|$)|o\d)/.test(model)) return "low";
  return undefined;
}

const outputTextSchema = z.object({
  output_text: z.string().optional(),
});

export function extractOutputText(response: unknown): string | undefined {
  const parsed = outputTextSchema.safeParse(response);
  return parsed.success ? parsed.data.output_text : undefined;
}
