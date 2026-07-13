/**
 * Phase 5 / item 38: resolve a short-lived signed download URL for a
 * completed creative-work output. Transport (JSON vs redirect) stays in the
 * HTTP adapter.
 */
import { getCreativeWork } from "@/server/repositories/creative-work";
import { objectStorage } from "@/server/storage";

export type ResolveCreativeWorkOutputDownloadInput = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
};

export type ResolveCreativeWorkOutputDownloadError =
  | { code: "work_not_found" }
  | { code: "output_not_found" }
  | { code: "output_not_ready"; status: string };

export type ResolveCreativeWorkOutputDownloadSuccess = {
  url: string;
  outputKey: string;
};

export type ResolveCreativeWorkOutputDownloadResult =
  | { ok: true; value: ResolveCreativeWorkOutputDownloadSuccess }
  | { ok: false; error: ResolveCreativeWorkOutputDownloadError };

export async function resolveCreativeWorkOutputDownload(
  input: ResolveCreativeWorkOutputDownloadInput
): Promise<ResolveCreativeWorkOutputDownloadResult> {
  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) {
    return { ok: false, error: { code: "work_not_found" } };
  }

  const output = existing.outputs.find((o) => o.id === input.outputId);
  if (!output) {
    return { ok: false, error: { code: "output_not_found" } };
  }

  if (output.status !== "completed" || !output.outputKey) {
    return {
      ok: false,
      error: { code: "output_not_ready", status: output.status },
    };
  }

  const url = await objectStorage.signedDownloadUrl(output.outputKey);
  return {
    ok: true,
    value: { url, outputKey: output.outputKey },
  };
}
