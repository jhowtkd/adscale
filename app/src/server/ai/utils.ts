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

const outputTextSchema = z.object({
  output_text: z.string().optional(),
});

export function extractOutputText(response: unknown): string | undefined {
  const parsed = outputTextSchema.safeParse(response);
  return parsed.success ? parsed.data.output_text : undefined;
}
