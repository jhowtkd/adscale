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
import type { DiagnosticContext } from "@/server/diagnostics/contract";
import {
  resolveLifecycleTraceContext,
  traceExportPrepared,
} from "@/server/diagnostics/selection-export-tracing";
import { objectStorage } from "@/server/storage";
import { layerizationStateFromDatabase } from "@/server/layerize/contracts";
import { layerEditorStateFromDatabase } from "@/server/layer-editor/contracts";
import { materializeLayerEditorDraft } from "@/server/layer-editor/artifacts";
import {
  layerizationArtifactKey,
  recomposeStoredLayers,
  writeLayerizationDiagnosticZipFile,
} from "@/server/layerize/artifacts";
import { recordCreativeWorkValueEvent, valueEventFromCreativeWork } from "@/server/creative-work/record-value-event";

export type CreativeWorkOutputDownloadFormat = "original" | "psd" | "zip" | "layer" | "layer-candidate" | "draft-png" | "draft-psd";

export type ResolveCreativeWorkOutputDownloadInput = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  format?: CreativeWorkOutputDownloadFormat;
  layerId?: string;
  revision?: number;
  actorUserId?: string;
};

export type ResolveCreativeWorkOutputDownloadError =
  | { code: "work_not_found" }
  | { code: "output_not_found" }
  | { code: "output_not_ready"; status: string };

export type ResolveCreativeWorkOutputDownloadSuccess = {
  url: string;
  outputKey: string;
  /**
   * trace-390: the journal operation this download resolved under (Peça única
   * only; absent otherwise). Threaded to the HTTP adapter so `export.served`
   * lands on the same operation as `export.prepared`. Telemetry only — it
   * never leaves the server and never decides business outcomes.
   */
  traceContext?: DiagnosticContext;
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
  // trace-390: every successful resolution is one export operation with its
  // own journal context — repeated downloads are distinct operations over the
  // same Peça, never new Peças. Failures return before this point and emit
  // nothing; the delivered value event below stays exactly as it was.
  const succeed = (
    resolvedKey: string,
    url: string,
  ): ResolveCreativeWorkOutputDownloadResult => {
    const traceContext = resolveLifecycleTraceContext({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      outputId: output.id,
      clientProfileId: existing.work.clientProfileId ?? null,
      toolKind: existing.work.toolKind,
    });
    if (traceContext) {
      traceExportPrepared({ context: traceContext, format });
    }
    return {
      ok: true,
      value: { url, outputKey: resolvedKey, ...(traceContext ? { traceContext } : {}) },
    };
  };
  const editor = layerEditorStateFromDatabase(output.layerEditor);
  if (format === "psd" && editor?.publishedPsdKey) {
    return succeed(editor.publishedPsdKey, await objectStorage.signedDownloadUrl(editor.publishedPsdKey));
  }
  if (["layer", "layer-candidate", "draft-png", "draft-psd"].includes(format)) {
    if (!editor) return { ok: false, error: { code: "output_not_ready", status: "layer_editor_not_started" } };
    let outputKey: string | null = null;
    if (format === "layer") outputKey = input.layerId ? editor.layers.find((layer) => layer.id === input.layerId)?.currentKey ?? null : null;
    if (format === "layer-candidate") outputKey = editor.regeneration?.status === "ready" ? editor.regeneration.candidateKey : null;
    if (format === "draft-png" || format === "draft-psd") {
      if (input.revision !== editor.revision) return { ok: false, error: { code: "output_not_ready", status: "layer_editor_revision_conflict" } };
      const draft = await materializeLayerEditorDraft({ workspaceId: input.workspaceId, workItemId: input.workItemId, outputId: input.outputId, revision: editor.revision });
      outputKey = format === "draft-png" ? draft.pngKey : draft.psdKey;
    }
    if (!outputKey) return { ok: false, error: { code: "output_not_ready", status: "layer_editor_artifact_missing" } };
    return succeed(outputKey, await objectStorage.signedDownloadUrl(outputKey));
  }
  const state = layerizationStateFromDatabase(output.layerization);
  if (format !== "original") {
    if (state?.status !== "completed") {
      return { ok: false, error: { code: "output_not_ready", status: state?.status ?? "layerization_not_started" } };
    }
    const outputKey = format === "psd"
      ? (editor?.publishedPsdKey ?? state.psdKey)
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
    return succeed(outputKey, url);
  }

  const url = await objectStorage.signedDownloadUrl(output.outputKey);
  const userId = input.actorUserId ?? existing.work.createdByUserId;
  if (userId && existing.work.createdByUserId) {
    const context = valueEventFromCreativeWork(existing.work);
    await recordCreativeWorkValueEvent({
      ...context,
      userId,
      kind: "delivered",
      outputId: output.id,
      outputKey: output.outputKey,
    });
  }
  return succeed(output.outputKey, url);
}
