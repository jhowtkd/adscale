/**
 * Phase 5 / item 38: resolve a short-lived signed download URL for a
 * completed creative-work output. Transport (JSON vs redirect) stays in the
 * HTTP adapter.
 */
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { objectStorage } from "@/server/storage";
import { layerizationStateFromDatabase } from "@/server/layerize/contracts";
import {
  layerizationArtifactKey,
  recomposeStoredLayers,
  writeLayerizationDiagnosticZipFile,
} from "@/server/layerize/artifacts";

export type CreativeWorkOutputDownloadFormat = "original" | "psd" | "zip";

export type ResolveCreativeWorkOutputDownloadInput = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  format?: CreativeWorkOutputDownloadFormat;
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

async function materializeDiagnosticZip(input: {
  workItemId: string;
  outputId: string;
  outputKey: string;
  state: NonNullable<ReturnType<typeof layerizationStateFromDatabase>>;
}): Promise<string> {
  const zipKey = input.state.diagnosticZipKey ?? layerizationArtifactKey({
    workItemId: input.workItemId,
    attemptId: input.state.attemptId,
  }, "zip");
  if (await objectStorage.head(zipKey)) return zipKey;
  if (!input.state.baseWidth || !input.state.baseHeight || !input.state.fidelity) {
    throw new Error("Completed layerization is missing diagnostic evidence");
  }
  const width = input.state.baseWidth;
  const height = input.state.baseHeight;
  const directory = await mkdtemp(join(tmpdir(), "adscale-layerize-zip-"));
  const filePath = join(directory, "piece.zip");
  try {
    await writeLayerizationDiagnosticZipFile({
      filePath,
      loadOriginal: () => objectStorage.get(input.outputKey),
      loadRecomposed: () => recomposeStoredLayers({
        width,
        height,
        layers: input.state.layers,
        load: (layer) => objectStorage.get(layer.storageKey),
      }),
      layers: input.state.layers,
      loadLayer: (layer) => objectStorage.get(layer.storageKey),
      manifest: {
        version: 1,
        workItemId: input.workItemId,
        outputId: input.outputId,
        attemptId: input.state.attemptId,
        providerModel: input.state.providerModel,
        canvas: { width: input.state.baseWidth, height: input.state.baseHeight },
        layers: input.state.layers,
        fidelity: input.state.fidelity,
      },
    });
    await objectStorage.putStream(zipKey, createReadStream(filePath), "application/zip");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  return zipKey;
}

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

  const format = input.format ?? "original";
  const state = layerizationStateFromDatabase(output.layerization);
  if (format !== "original") {
    if (state?.status !== "completed") {
      return { ok: false, error: { code: "output_not_ready", status: state?.status ?? "layerization_not_started" } };
    }
    const outputKey = format === "psd"
      ? state.psdKey
      : await materializeDiagnosticZip({
        workItemId: input.workItemId,
        outputId: input.outputId,
        outputKey: output.outputKey,
        state,
      });
    if (!outputKey) {
      return { ok: false, error: { code: "output_not_ready", status: "layerization_artifact_missing" } };
    }
    const url = await objectStorage.signedDownloadUrl(outputKey);
    return { ok: true, value: { url, outputKey } };
  }

  const url = await objectStorage.signedDownloadUrl(output.outputKey);
  return {
    ok: true,
    value: { url, outputKey: output.outputKey },
  };
}
