import "server-only";

import { objectStorage } from "@/server/storage";
import { getCreativeWork } from "@/server/repositories/creative-work";
import {
  claimCreativeWorkLayerizationFinalization,
  claimCreativeWorkLayerizationProcessing,
  completeCreativeWorkLayerization,
  failCreativeWorkLayerization,
  getCreativeWorkLayerizationOutput,
  markCreativeWorkLayerizationReconciling,
  markCreativeWorkLayerizationSubmissionUnknown,
  recordCreativeWorkLayerizationProviderRequest,
  updateCreativeWorkLayerizationState,
} from "@/server/repositories/creative-work-layerization";
import {
  layerizationStateFromDatabase,
  type LayerizationLayer,
  type LayerizationState,
} from "@/server/layerize/contracts";
import {
  createSeedreamProvider,
  downloadSeedreamLayers,
  normalizeSeedreamLayerResponse,
  type SeedreamProvider,
} from "@/server/layerize/seedream-provider";
import {
  calculateLayerizationFidelity,
  recomposeLayerBitmaps,
  writeLayerizationDiagnosticZip,
  writeLayerizationPsd,
  type LayerBitmap,
} from "@/server/layerize/artifacts";
import { inngest } from "./client";

export type CreativeWorkLayerizationEvent = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  attemptId: string;
  callbackUrl?: string;
};

type LayerizationStep = {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>;
  sleep(name: string, duration: string): Promise<void>;
};
const MAX_RECONCILIATION_POLLS = 4;

const LAYERIZE_PROMPT = [
  "Separate this approved flat creative into editable named PNG layers.",
  "Return exactly one full-canvas base layer plus every visible foreground layer.",
  "For every layer provide an English name, a concise English description, pixel bbox, order, and PNG URL.",
].join(" ");

function layerStorageKey(input: CreativeWorkLayerizationEvent, order: number): string {
  return `creative-work/${input.workItemId}/layerize/${input.attemptId}/layers/${String(order).padStart(2, "0")}.png`;
}

function artifactKey(input: CreativeWorkLayerizationEvent, extension: "psd" | "zip"): string {
  return `creative-work/${input.workItemId}/layerize/${input.attemptId}/piece.${extension}`;
}

async function readCurrentState(input: CreativeWorkLayerizationEvent): Promise<LayerizationState | null> {
  const row = await getCreativeWorkLayerizationOutput(input.workspaceId, input.workItemId, input.outputId);
  return layerizationStateFromDatabase(row?.layerization);
}

function stateWithArtifacts(
  state: LayerizationState,
  input: { width: number; height: number; layers: LayerizationLayer[]; fidelity: LayerizationState["fidelity"] },
): LayerizationState {
  return {
    ...state,
    baseWidth: input.width,
    baseHeight: input.height,
    layers: input.layers,
    fidelity: input.fidelity,
    updatedAt: new Date().toISOString(),
  };
}

export async function runCreativeWorkLayerization(input: {
  event: CreativeWorkLayerizationEvent;
  provider?: SeedreamProvider;
}): Promise<{ status: LayerizationState["status"] | "skipped" }> {
  const { event } = input;
  const provider = input.provider ?? createSeedreamProvider();
  const initialState = await readCurrentState(event);
  if (!initialState || initialState.attemptId !== event.attemptId) return { status: "skipped" };
  let state: LayerizationState = initialState;
  if (["completed", "failed", "submission_unknown"].includes(state.status)) return { status: state.status };

  if (state.status === "queued") {
    const claimed = await claimCreativeWorkLayerizationProcessing(event.workspaceId, event.workItemId, event.outputId);
    if (!claimed) return { status: "skipped" };
    state = layerizationStateFromDatabase(claimed.layerization) ?? state;
  } else if (state.status === "processing" && !state.providerRequestId) {
    // A redelivery after the submit boundary is unknown: never submit again.
    await markCreativeWorkLayerizationSubmissionUnknown(event.workspaceId, event.workItemId, event.outputId);
    return { status: "submission_unknown" };
  }

  const aggregate = await getCreativeWork(event.workspaceId, event.workItemId);
  const output = aggregate?.outputs.find((candidate) => candidate.id === event.outputId);
  if (!output?.outputKey) {
    await failCreativeWorkLayerization({
      workspaceId: event.workspaceId,
      workItemId: event.workItemId,
      outputId: event.outputId,
      code: "source_missing",
    });
    return { status: "failed" };
  }

  if (!state.providerRequestId) {
    let requestId: string;
    try {
      const sourceUrl = await objectStorage.signedDownloadUrl(output.outputKey);
      const submitted = await provider.submit({
        prompt: LAYERIZE_PROMPT,
        imageUrl: sourceUrl,
        callbackUrl: event.callbackUrl,
      });
      requestId = submitted.requestId;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? (error as { code?: unknown }).code : null;
      if (code === "missing_configuration") {
        await failCreativeWorkLayerization({
          workspaceId: event.workspaceId,
          workItemId: event.workItemId,
          outputId: event.outputId,
          code: "missing_configuration",
        });
        return { status: "failed" };
      }
      await markCreativeWorkLayerizationSubmissionUnknown(event.workspaceId, event.workItemId, event.outputId);
      return { status: "submission_unknown" };
    }
    const recorded = await recordCreativeWorkLayerizationProviderRequest(
      event.workspaceId,
      event.workItemId,
      event.outputId,
      requestId,
    );
    state = layerizationStateFromDatabase(recorded?.layerization) ?? { ...state, providerRequestId: requestId };
  }

  try {
    const status = await provider.status(state.providerRequestId!);
    if (status === "FAILED") {
      await failCreativeWorkLayerization({
        workspaceId: event.workspaceId,
        workItemId: event.workItemId,
        outputId: event.outputId,
        code: "provider_error",
      });
      return { status: "failed" };
    }
    if (status !== "COMPLETED") {
      await markCreativeWorkLayerizationReconciling(event.workspaceId, event.workItemId, event.outputId);
      return { status: "reconciling" };
    }
  } catch {
    await markCreativeWorkLayerizationReconciling(event.workspaceId, event.workItemId, event.outputId);
    return { status: "reconciling" };
  }

  let providerPayload: unknown;
  try {
    providerPayload = await provider.result(state.providerRequestId!);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as { code?: unknown }).code : null;
    if (code === "invalid_provider_response") {
      await failCreativeWorkLayerization({
        workspaceId: event.workspaceId,
        workItemId: event.workItemId,
        outputId: event.outputId,
        code: "invalid_provider_response",
      });
      return { status: "failed" };
    }
    await markCreativeWorkLayerizationReconciling(event.workspaceId, event.workItemId, event.outputId);
    return { status: "reconciling" };
  }

  const finalizing = await claimCreativeWorkLayerizationFinalization(event.workspaceId, event.workItemId, event.outputId);
  if (!finalizing) return { status: "skipped" };
  state = layerizationStateFromDatabase(finalizing.layerization) ?? state;

  try {
    const normalized = normalizeSeedreamLayerResponse(providerPayload);
    const layerBuffers = await downloadSeedreamLayers(normalized.layers);
    const layerBitmaps: LayerBitmap[] = normalized.layers.map((layer, index) => {
      const { sourceUrl: _sourceUrl, ...metadata } = layer;
      void _sourceUrl;
      return {
        ...metadata,
        storageKey: layerStorageKey(event, layer.order),
        sourceBytes: layerBuffers[index].length,
        png: layerBuffers[index],
      };
    });
    await Promise.all(layerBitmaps.map((layer) => objectStorage.put(layer.storageKey, layer.png, "image/png")));
    const original = await objectStorage.get(output.outputKey);
    const recomposed = await recomposeLayerBitmaps({
      width: normalized.width,
      height: normalized.height,
      layers: layerBitmaps,
    });
    const fidelity = await calculateLayerizationFidelity(original, recomposed, {
      width: normalized.width,
      height: normalized.height,
    });
    const durableLayers = layerBitmaps.map((layer) => {
      const { png, ...durable } = layer;
      void png;
      return durable;
    });
    state = await updateCreativeWorkLayerizationState({
      workspaceId: event.workspaceId,
      workItemId: event.workItemId,
      outputId: event.outputId,
      state: stateWithArtifacts(state, {
        width: normalized.width,
        height: normalized.height,
        layers: durableLayers,
        fidelity,
      }),
    }).then((row) => layerizationStateFromDatabase(row?.layerization) ?? state);
    if (fidelity.gate !== "passed") {
      await failCreativeWorkLayerization({
        workspaceId: event.workspaceId,
        workItemId: event.workItemId,
        outputId: event.outputId,
        code: "fidelity_gate_failed",
      });
      return { status: "failed" };
    }
    const psdKey = artifactKey(event, "psd");
    const diagnosticZipKey = artifactKey(event, "zip");
    const psd = await writeLayerizationPsd({
      width: normalized.width,
      height: normalized.height,
      layers: layerBitmaps,
      recomposed,
    });
    const diagnosticZip = await writeLayerizationDiagnosticZip({
      original,
      recomposed,
      layers: layerBitmaps,
      manifest: {
        version: 1,
        workItemId: event.workItemId,
        outputId: event.outputId,
        attemptId: event.attemptId,
        providerModel: state.providerModel,
        canvas: { width: normalized.width, height: normalized.height },
        layers: durableLayers,
        fidelity,
      },
    });
    await objectStorage.put(psdKey, psd, "image/vnd.adobe.photoshop");
    await objectStorage.put(diagnosticZipKey, diagnosticZip, "application/zip");
    const completedState = { ...state, psdKey, diagnosticZipKey, updatedAt: new Date().toISOString() };
    await completeCreativeWorkLayerization({
      workspaceId: event.workspaceId,
      workItemId: event.workItemId,
      outputId: event.outputId,
      state: completedState,
    });
    return { status: "completed" };
  } catch (error) {
    const code = error instanceof Error && "code" in error && (error as { code?: unknown }).code === "unsafe_media"
      ? "unsafe_media"
      : error instanceof Error && "code" in error && (error as { code?: unknown }).code === "invalid_provider_response"
        ? "invalid_provider_response"
        : "storage_error";
    await failCreativeWorkLayerization({
      workspaceId: event.workspaceId,
      workItemId: event.workItemId,
      outputId: event.outputId,
      code,
    });
    return { status: "failed" };
  }
}

const layerizationJobConfig = {
  id: "layerize-creative-work-output",
  retries: 0 as const,
};

async function layerizationJobHandler({ event, step }: { event: { data: CreativeWorkLayerizationEvent }; step: LayerizationStep }) {
  let result: Awaited<ReturnType<typeof runCreativeWorkLayerization>> = { status: "skipped" };
  for (let poll = 0; poll < MAX_RECONCILIATION_POLLS; poll += 1) {
    result = await step.run(`layerize-creative-work-${poll}`, () => runCreativeWorkLayerization({ event: event.data }));
    if (result.status !== "reconciling" || poll === MAX_RECONCILIATION_POLLS - 1) return result;
    await step.sleep(`wait-for-layerization-${poll}`, "15s");
  }
  return result;
}

export const creativeWorkLayerizationJob = inngest.createFunction(
  { ...layerizationJobConfig, triggers: [{ event: "creative-work.layerize" }] },
  layerizationJobHandler,
);

export function createCreativeWorkLayerizationJobV2(client: typeof inngest) {
  return client.createFunction(
    { ...layerizationJobConfig, id: "layerize-creative-work-output-v2", triggers: [{ event: "creative-work.layerize.v2" }] },
    layerizationJobHandler,
  );
}
