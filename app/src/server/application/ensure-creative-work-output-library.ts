/**
 * Idempotent library insert for a completed creative-work output (Phase 5 / item 37).
 * Shared by job complete path and select route — same key ⇒ reuse existing asset.
 */
import {
  createWorkspaceAsset,
  createWorkspaceAssetIfKeyAbsent,
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

export type EnsureCreativeWorkOutputLibraryResult =
  | { asset: Awaited<ReturnType<typeof createWorkspaceAsset>>; created: boolean; conflict?: undefined }
  | { asset: null; created: false; conflict: "key_owned_elsewhere" };

export async function ensureCreativeWorkOutputInLibrary(
  input: EnsureCreativeWorkOutputLibraryInput
): Promise<EnsureCreativeWorkOutputLibraryResult> {
  const existing = await getWorkspaceAssetByKey(input.workspaceId, input.outputKey);
  if (existing) return { asset: existing, created: false };

  const head = await objectStorage.head(input.outputKey);
  const size = Number(head?.contentLength ?? 0);
  const asset = await createWorkspaceAssetIfKeyAbsent({
    workspaceId: input.workspaceId,
    name: `Post ${input.theme} - ${input.creativeLevel}`,
    key: input.outputKey,
    type: "image/png",
    size,
    source: "creative_work",
  });
  if (asset) return { asset, created: true };

  // Perdeu a corrida: relemos com escopo de workspace. Se a chave existe mas
  // pertence a outro workspace, NAO devolvemos o ativo alheio — isolamento
  // vale mais do que completar o efeito.
  const winner = await getWorkspaceAssetByKey(input.workspaceId, input.outputKey);
  return winner
    ? { asset: winner, created: false }
    : { asset: null, created: false, conflict: "key_owned_elsewhere" };
}
