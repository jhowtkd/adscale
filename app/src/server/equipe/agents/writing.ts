// Redação IA: reuses the existing caption generation (#550).
//
// No new caption generator: writing runs generateSocialPostCopy (the same
// application service behind POST /api/creative-work/[id]/copy) over the
// item's creative work. Spend/credits stay in that service.

import {
  generateSocialPostCopy,
  type GenerateSocialPostCopyResult,
} from "@/server/application/generate-social-post-copy";
import type { SocialPostCopy } from "@/server/creative-work/contracts";

export type WritingInput = {
  workspaceId: string;
  /** The item's creative work (equipe_items.creative_work_id). */
  workItemId: string;
};

export type WritingDeps = {
  generateCopy?: (
    input: Parameters<typeof generateSocialPostCopy>[0],
  ) => Promise<GenerateSocialPostCopyResult>;
};

export async function runWriting(
  input: WritingInput,
  deps: WritingDeps = {},
): Promise<SocialPostCopy> {
  const generate = deps.generateCopy ?? generateSocialPostCopy;
  const result = await generate({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    userId: "equipe-agent:redacao",
  });
  if (!result.ok) {
    throw new Error(`writing_failed:${result.error.code}`);
  }
  return result.value.copy;
}
