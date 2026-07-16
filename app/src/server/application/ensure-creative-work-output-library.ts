/**
 * Idempotent library insert for a completed creative-work output (Phase 5 / item 37).
 * Shared by job complete path and select route — same key ⇒ reuse existing asset.
 */
import {
  createWorkspaceAsset,
  getWorkspaceAssetByKey,
} from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";

export type EnsureCreativeWorkOutputLibraryInput = {
  workspaceId: string;
  outputKey: string;
  /** Brief theme used in the library display name. */
  theme: string;
  creativeLevel: string;
};

export type EnsureCreativeWorkOutputLibraryResult = {
  asset: Awaited<ReturnType<typeof createWorkspaceAsset>>;
  /** False when an asset for this key already existed. */
  created: boolean;
};

/**
 * Ensure a creative_work-sourced workspace asset exists for the output key.
 * Idempotent: if key is already registered in the workspace, returns it.
 */
export async function ensureCreativeWorkOutputInLibrary(
  input: EnsureCreativeWorkOutputLibraryInput
): Promise<EnsureCreativeWorkOutputLibraryResult> {
  const existing = await getWorkspaceAssetByKey(
    input.workspaceId,
    input.outputKey
  );
  if (existing) {
    return { asset: existing, created: false };
  }

  const head = await objectStorage.head(input.outputKey);
  const size = Number(head?.contentLength ?? 0);
  const asset = await createWorkspaceAsset({
    workspaceId: input.workspaceId,
    name: `Post ${input.theme} - ${input.creativeLevel}`,
    key: input.outputKey,
    type: "image/png",
    size,
    source: "creative_work",
  });
  return { asset, created: true };
}
