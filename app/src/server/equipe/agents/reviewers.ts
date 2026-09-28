// Revisores IA: text (different model from the author) + visual (#550).
//
// Both reviewers DETECT and report; neither rewrites nor approves. Findings
// come back in a typed shape for the module to store on the item version
// (record_finding arrives with #545; until then the job returns them).

import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import type { EquipeModelClient } from "./model-client";
import {
  textReviewerSystemPrompt,
  textReviewUserMessage,
  visualReviewerSystemPrompt,
  visualReviewUserMessage,
} from "./prompts";
import { resolveReviewerModel } from "./roles";

export const reviewFindingSchema = z.object({
  severity: z.enum(["info", "warning", "blocking"]),
  area: z.enum(["text", "visual", "factual", "brand"]),
  message: z.string().min(1),
  // Nullable (not optional): structured output requires every field.
  suggestion: z.string().nullable(),
});

export type ReviewFinding = z.infer<typeof reviewFindingSchema>;

export const reviewOutputSchema = z.object({
  findings: z.array(reviewFindingSchema),
  summary: z.string().min(1),
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

function parseReviewOutput(content: string | null, label: string): ReviewOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content ?? "null");
  } catch {
    throw new Error(`${label}_invalid_json`);
  }
  const validated = reviewOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`${label}_schema_mismatch: ${validated.error.issues[0]?.message ?? "invalid"}`);
  }
  return validated.data;
}

export type ModelCallHook = {
  onModelCall?: (call: { model: string; inputTokens: number; outputTokens: number }) => Promise<void>;
};

export type TextReviewInput = ModelCallHook & {
  client: EquipeModelClient;
  copy: { headline: string; body: string; cta: string };
  /** Facts sustained by authorized sources; claims outside them are flagged. */
  facts?: string[];
  model?: string;
};

export async function runTextReview(input: TextReviewInput): Promise<ReviewOutput> {
  const model = input.model ?? resolveReviewerModel();
  const response = await input.client.chat({
    model,
    messages: [
      { role: "system", content: textReviewerSystemPrompt() },
      { role: "user", content: textReviewUserMessage({ ...input.copy, facts: input.facts ?? [] }) },
    ],
    responseFormat: zodResponseFormat(reviewOutputSchema, "equipe_text_review"),
    maxTokens: 1500,
  });
  await input.onModelCall?.({
    model,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
  });
  return parseReviewOutput(response.content, "text_review");
}

export type VisualReviewInput = ModelCallHook & {
  client: EquipeModelClient;
  imageUrl: string;
  brief: string;
  model?: string;
};

export async function runVisualReview(input: VisualReviewInput): Promise<ReviewOutput> {
  if (!input.imageUrl) {
    throw new Error("visual_review_requires_image");
  }
  const model = input.model ?? resolveReviewerModel();
  const response = await input.client.chat({
    model,
    messages: [
      { role: "system", content: visualReviewerSystemPrompt() },
      {
        role: "user",
        content: [
          { type: "text", text: visualReviewUserMessage(input.brief) },
          { type: "image_url", image_url: { url: input.imageUrl } },
        ],
      },
    ],
    responseFormat: zodResponseFormat(reviewOutputSchema, "equipe_visual_review"),
    maxTokens: 1500,
  });
  await input.onModelCall?.({
    model,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
  });
  return parseReviewOutput(response.content, "visual_review");
}
