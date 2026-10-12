import "server-only";
import { createHash } from "node:crypto";
import { logger } from "../lib/logger";

// Register static fragment text here, in fixed order, as skills are extracted.
const SHARED_SKILL_TEXTS: readonly string[] = [];

export const CREATIVE_WORK_PROMPT_VERSION_BASE = "creative-work-prompts/v1";

export function getSharedSkillsFingerprint(
  canonicalTexts: readonly string[] = SHARED_SKILL_TEXTS,
): string {
  return createHash("sha256").update(JSON.stringify(canonicalTexts), "utf8").digest("hex");
}

export function getCreativeWorkPromptVersion(
  canonicalTexts: readonly string[] = SHARED_SKILL_TEXTS,
): string {
  return `${CREATIVE_WORK_PROMPT_VERSION_BASE}+${getSharedSkillsFingerprint(canonicalTexts)}`;
}

export function logCreativeWorkPromptVersion(fields: {
  promptVersion: string;
  operation: string;
  workItemId?: string;
  callId?: string;
}): void {
  try {
    logger.info({
      event: "creative_work_prompt_version",
      promptVersion: fields.promptVersion,
      operation: fields.operation,
      ...(fields.workItemId === undefined ? {} : { workItemId: fields.workItemId }),
      ...(fields.callId === undefined ? {} : { callId: fields.callId }),
    });
  } catch {
    // Auxiliary logging must not interrupt or retry a model invocation.
  }
}
