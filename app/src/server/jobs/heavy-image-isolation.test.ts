import { describe, expect, it } from "vitest";
import {
  heavyImageExecutorIdentity,
  heavyImageIsolationEvidence,
  REQUIRED_HEAVY_IMAGE_SERVICE,
  REQUIRED_V2_FUNCTION_COUNT,
  WORKER_CONNECTED_EVENT,
} from "./heavy-image-isolation";

describe("heavy image isolation evidence", () => {
  it("is not isolated until the worker is live, connected, and synced", () => {
    expect(heavyImageIsolationEvidence({
      liveServiceNames: ["adscale-app", "adscale-marketing"],
      workerConnected: false,
      syncedV2FunctionCount: 0,
    })).toEqual({
      isolated: false,
      missing: [
        REQUIRED_HEAVY_IMAGE_SERVICE,
        WORKER_CONNECTED_EVENT,
        `v2_functions_0_of_${REQUIRED_V2_FUNCTION_COUNT}`,
      ],
    });
  });

  it("does not treat a service name alone as isolation", () => {
    expect(heavyImageIsolationEvidence({
      liveServiceNames: ["adscale-app", REQUIRED_HEAVY_IMAGE_SERVICE],
      workerConnected: false,
      syncedV2FunctionCount: REQUIRED_V2_FUNCTION_COUNT,
    }).isolated).toBe(false);
  });

  it("is isolated only with live worker, connected log, and eight v2 functions", () => {
    expect(heavyImageIsolationEvidence({
      liveServiceNames: ["adscale-app", REQUIRED_HEAVY_IMAGE_SERVICE],
      workerConnected: true,
      syncedV2FunctionCount: REQUIRED_V2_FUNCTION_COUNT,
    })).toEqual({ isolated: true, missing: [] });
  });

  it("names the executor process so a failure can be correlated to the worker instance", () => {
    expect(heavyImageExecutorIdentity({
      RENDER_SERVICE_NAME: "adscale-image-worker",
      RENDER_INSTANCE_ID: "srv-abc",
    })).toEqual({
      executorAppId: "adscale-image-worker",
      executorPid: process.pid,
      executorInstance: "srv-abc",
    });
  });

  it("does not claim isolation after a restart without a live worker", () => {
    const input = {
      liveServiceNames: ["adscale-app"],
      workerConnected: false,
      syncedV2FunctionCount: 0,
    } as const;
    expect(heavyImageIsolationEvidence(input)).toEqual(heavyImageIsolationEvidence(input));
    expect(heavyImageIsolationEvidence(input).isolated).toBe(false);
  });
});
