import "server-only";
import { getOpenAI } from "@/server/ai/utils";
import { env } from "@/server/validation/env";
import type {
  SocialPostBrief,
  SocialPostCopy,
} from "./contracts";
import { socialPostCopySchema } from "./contracts";

const SOCIAL_POST_COPY_SYSTEM_PROMPT = [
  "You are a senior Portuguese (pt-BR) social-media copywriter.",
  "",
  "Return ONLY a JSON object with exactly these three string keys and no other keys, commentary, or markdown:",
  "{",
  '  "headline": "<short, punchy headline (<=120 chars)>",',
  '  "body": "<supporting paragraph (<=600 chars)>",',
  '  "cta": "<call to action verb phrase (<=80 chars)>"',
  "}",
  "",
  "Constraints:",
  "- Write in pt-BR.",
  "- Headline, body, and CTA must be on-brand and consistent with the brief.",
  "- Do not include emojis unless explicitly required.",
  "- Do not include trailing whitespace.",
].join("\n");

function renderVoiceBlock(
  toneOfVoice: string | null,
  requiredElements: string | null,
  prohibitedElements: string | null,
): string {
  const lines: string[] = [];
  if (toneOfVoice && toneOfVoice.trim().length > 0) {
    lines.push(`- Tone of voice: ${toneOfVoice.trim()}`);
  }
  if (requiredElements && requiredElements.trim().length > 0) {
    lines.push(`- Required elements: ${requiredElements.trim()}`);
  }
  if (prohibitedElements && prohibitedElements.trim().length > 0) {
    lines.push(`- Prohibited elements: ${prohibitedElements.trim()}`);
  }
  return lines.join("\n");
}

export async function generateSocialPostCopy(input: {
  brief: SocialPostBrief;
  brandName: string;
  toneOfVoice: string | null;
  requiredElements: string | null;
  prohibitedElements: string | null;
}): Promise<SocialPostCopy> {
  const { brief, brandName, toneOfVoice, requiredElements, prohibitedElements } =
    input;

  const voiceBlock = renderVoiceBlock(
    toneOfVoice,
    requiredElements,
    prohibitedElements,
  );

  const userPrompt = [
    `Brand: ${brandName}`,
    "",
    "Brief:",
    `- Theme: ${brief.theme}`,
    `- Objective: ${brief.objective}`,
    `- Audience: ${brief.audience}`,
    `- Offer: ${brief.offer}`,
    "",
    "Approved brand voice:",
    voiceBlock.length > 0 ? voiceBlock : "- (no voice notes provided)",
    "",
    "Write the social post copy in pt-BR following the JSON contract in the system prompt.",
  ].join("\n");

  const model = env.OPENAI_TEXT_MODEL || "gpt-4o-mini";

  const response = await getOpenAI().chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SOCIAL_POST_COPY_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Social post copy generation returned an empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Social post copy generation returned invalid JSON: ${(error as Error).message}`,
    );
  }

  // Fail loudly on schema mismatch — no silent defaults.
  return socialPostCopySchema.parse(parsed);
}