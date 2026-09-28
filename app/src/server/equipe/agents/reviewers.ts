// Revisores IA: text (different model from the author) + visual (#550).
//
// Both reviewers DETECT and report; neither rewrites nor approves. Findings
// come back in a typed shape for the module to store on the item version
// (record_finding arrives with #545; until then the job returns them).

import { z } from "zod";
import {
  EquipeModelRefusalError,
  EquipeModelTruncatedError,
  type EquipeModelClient,
  type ModelCallResponse,
  type ModelCallUsage,
} from "./model-client";
import type { EquipeEffort } from "./provider";
import {
  textReviewContextMessage,
  textReviewerSystemPrompt,
  textReviewItemMessage,
  visualReviewBriefMessage,
  visualReviewerSystemPrompt,
  visualReviewInstructionMessage,
} from "./prompts";
import { resolveReviewerEffort, resolveReviewerModel } from "./roles";

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

/** Reasoning tokens count toward the output limit: room for both. */
export const REVIEW_MAX_TOKENS = 16000;

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

/** A cut or refused answer is a failed task — never an empty review. */
function throwOnBadStop(response: ModelCallResponse, label: string): void {
  if (response.stopReason === "refusal") {
    throw new EquipeModelRefusalError(`${label}_refused`);
  }
  if (response.stopReason === "max_tokens") {
    throw new EquipeModelTruncatedError(`${label}_truncated`);
  }
}

export type ModelCallHook = {
  onModelCall?: (call: ModelCallUsage) => Promise<void>;
};

export type TextReviewInput = ModelCallHook & {
  client: EquipeModelClient;
  copy: { headline: string; body: string; cta: string };
  /** Facts sustained by authorized sources; claims outside them are flagged. */
  facts?: string[];
  model?: string;
  effort?: EquipeEffort;
};

export async function runTextReview(input: TextReviewInput): Promise<ReviewOutput> {
  const model = input.model ?? resolveReviewerModel();
  const effort = input.effort ?? resolveReviewerEffort();
  const response = await input.client.chat({
    model,
    messages: [
      { role: "system", content: textReviewerSystemPrompt() },
      // Shared across the lote first (breakpoint on the last stable
      // block), the per-item copy after it.
      {
        role: "user",
        content: [
          { type: "text", text: textReviewContextMessage(input.facts ?? []), cacheBreakpoint: true },
          { type: "text", text: textReviewItemMessage(input.copy) },
        ],
      },
    ],
    output: { name: "equipe_text_review", schema: reviewOutputSchema },
    effort,
    maxTokens: REVIEW_MAX_TOKENS,
  });
  await input.onModelCall?.({ model, ...response.usage });
  throwOnBadStop(response, "text_review");
  return parseReviewOutput(response.content, "text_review");
}

export type VisualReviewInput = ModelCallHook & {
  client: EquipeModelClient;
  imageUrl: string;
  brief: string;
  model?: string;
  effort?: EquipeEffort;
};

export async function runVisualReview(input: VisualReviewInput): Promise<ReviewOutput> {
  if (!input.imageUrl) {
    throw new Error("visual_review_requires_image");
  }
  const model = input.model ?? resolveReviewerModel();
  const effort = input.effort ?? resolveReviewerEffort();
  const response = await input.client.chat({
    model,
    messages: [
      { role: "system", content: visualReviewerSystemPrompt() },
      // Static instruction first (breakpoint on the last stable
      // block), the per-item brief and image after it.
      {
        role: "user",
        content: [
          { type: "text", text: visualReviewInstructionMessage(), cacheBreakpoint: true },
          { type: "text", text: visualReviewBriefMessage(input.brief) },
          { type: "image_url", image_url: { url: input.imageUrl } },
        ],
      },
    ],
    output: { name: "equipe_visual_review", schema: reviewOutputSchema },
    effort,
    maxTokens: REVIEW_MAX_TOKENS,
  });
  await input.onModelCall?.({ model, ...response.usage });
  throwOnBadStop(response, "visual_review");
  return parseReviewOutput(response.content, "visual_review");
}
