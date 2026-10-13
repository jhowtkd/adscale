import "server-only";
import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";
import { SHARED_SKILL_TEXTS } from "./shared-skills-texts";

// v2 identifies the script builder composition using the shared untrusted-data rule (#651).
export const CREATIVE_WORK_PROMPT_VERSION_BASE = "creative-work-prompts/v2";
export const CREATIVE_WORK_PROMPT_VERSION_BASES = {
  composer: CREATIVE_WORK_PROMPT_VERSION_BASE,
  copy: "creative-work-copy/v2",
  image_prompt: "creative-work-image/v1",
  refinement: "creative-work-refinement/v1",
} as const;

export function getSharedSkillsFingerprint(): string {
  return createHash("sha256").update(JSON.stringify(SHARED_SKILL_TEXTS), "utf8").digest("hex");
}

export function getCreativeWorkPromptVersion(
  consumer: keyof typeof CREATIVE_WORK_PROMPT_VERSION_BASES = "composer",
): string {
  return `${CREATIVE_WORK_PROMPT_VERSION_BASES[consumer]}+${getSharedSkillsFingerprint()}`;
}

export function logCreativeWorkPromptVersion(
  fields: { promptVersion: string } & (
    | { operation: "art_direction"; callId: string; workItemId?: never }
    | { operation: "carousel_research" | "carousel_hooks" | "carousel_plan"; workItemId: string; callId?: never }
  ),
): void {
  try {
    logger.info({
      event: "creative_work_prompt_version",
      promptVersion: fields.promptVersion,
      operation: fields.operation,
      ...(fields.operation === "art_direction"
        ? { callId: fields.callId }
        : { workItemId: fields.workItemId }),
    });
  } catch {
    // Auxiliary logging must not interrupt or retry a model invocation.
  }
}
