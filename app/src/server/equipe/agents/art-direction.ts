// Direção de arte IA: it IS the ADScale engine (#550).
//
// No new image generation code. Art direction resolves the item's Trabalho
// through the AdscaleGateway; creation and generation keep running through
// the existing creative engine (Trabalho, Protocolo, Calibração da marca).

import type { AdscaleGateway } from "../module/ports";

export type ArtDirectionInput = {
  gateway: AdscaleGateway;
  workspaceId: string;
  /** The item's creative work (equipe_items.creative_work_id). */
  workId: string;
};

export type ArtDirectionResult = {
  workId: string;
  workspaceId: string;
  /** Generation is engine-owned; this adapter only resolves the Trabalho. */
  engineOwned: true;
};

export async function runArtDirection(input: ArtDirectionInput): Promise<ArtDirectionResult> {
  const work = await input.gateway.getCreativeWork(input.workId);
  if (!work || work.workspaceId !== input.workspaceId) {
    throw new Error("art_direction_work_not_found");
  }
  return { workId: work.id, workspaceId: work.workspaceId, engineOwned: true };
}
