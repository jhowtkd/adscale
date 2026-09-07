import { describe, expect, it } from "vitest";
import { CATALOG_PAGE_DEFAULT_LIMIT, takeCatalogPage } from "@/lib/catalog-page";
import { studioStageOccupancy } from "@/lib/studio/stage-occupancy";
import {
  HEAVY_IMAGE_NAVIGATION_P95_BUDGET_MS,
  heavyImageExecutorIdentity,
  heavyImageIsolationEvidence,
  percentile95,
} from "./heavy-image-isolation";
import { heavyImageEventName } from "./heavy-image-events";

describe("synthetic heavy-image isolation load", () => {
  it("keeps Studio occupancy and catalog paging under the navigation budget while jobs route off-process", () => {
    const previous = process.env.IMAGE_JOB_TARGET;
    process.env.IMAGE_JOB_TARGET = "worker";
    try {
      expect(heavyImageEventName("creative-work.generate")).toMatch(/\.v2$/);

      const uuid = (index: number) => `550e8400-e29b-41d4-a716-${String(index).padStart(12, "0")}`;
      const catalog = Array.from({ length: 3000 }, (_, index) => ({
        id: uuid(index),
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, index)),
      }));

      const samples: number[] = [];
      for (let i = 0; i < 200; i += 1) {
        const started = performance.now();
        const occupancy = studioStageOccupancy({
          hasContinueWork: false,
          outputCount: 0,
          sourceCount: 0,
        });
        const page = takeCatalogPage(
          catalog.slice(0, CATALOG_PAGE_DEFAULT_LIMIT + 1),
          CATALOG_PAGE_DEFAULT_LIMIT,
          (row) => ({ at: row.updatedAt, id: row.id }),
        );
        samples.push(performance.now() - started);
        expect(occupancy).toBe("empty");
        expect(page.items).toHaveLength(CATALOG_PAGE_DEFAULT_LIMIT);
      }

      expect(percentile95(samples)).toBeLessThan(HEAVY_IMAGE_NAVIGATION_P95_BUDGET_MS);
    } finally {
      if (previous === undefined) delete process.env.IMAGE_JOB_TARGET;
      else process.env.IMAGE_JOB_TARGET = previous;
    }
  });

  it("correlates each synthetic operation failure to the executor process", () => {
    const identity = heavyImageExecutorIdentity({
      RENDER_SERVICE_NAME: "adscale-image-worker",
      RENDER_INSTANCE_ID: "srv-synth",
    });
    const operations = Array.from({ length: 40 }, (_, index) => ({
      operationId: `op-${index}`,
      failed: index % 7 === 0,
      ...identity,
    }));
    const failures = operations.filter((row) => row.failed);
    expect(failures.length).toBeGreaterThan(0);
    expect(new Set(failures.map((row) => row.executorPid))).toEqual(new Set([process.pid]));
    expect(failures.every((row) => row.executorAppId === "adscale-image-worker")).toBe(true);
  });

  it("does not report production isolation from the synthetic load alone", () => {
    expect(heavyImageIsolationEvidence({
      liveServiceNames: ["adscale-app"],
      workerConnected: false,
      syncedV2FunctionCount: 8,
    }).isolated).toBe(false);
  });
});
