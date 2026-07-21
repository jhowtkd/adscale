import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getImageJobTarget,
  getImageRouteConcurrency,
  resolveHeavyEventName,
} from "./image-runtime-config";

describe("image-runtime-config", () => {
  afterEach(() => {
    delete process.env.IMAGE_JOB_TARGET;
    delete process.env.IMAGE_ROUTE_CONCURRENCY;
  });

  it("defaults IMAGE_JOB_TARGET to web", () => {
    expect(getImageJobTarget()).toBe("web");
    expect(resolveHeavyEventName("creative-work.generate")).toBe("creative-work.generate");
  });

  it("emits v2 event names when target is worker", () => {
    process.env.IMAGE_JOB_TARGET = "worker";
    expect(getImageJobTarget()).toBe("worker");
    expect(resolveHeavyEventName("creative-work.generate")).toBe("creative-work.generate.v2");
  });

  it("falls back to web for invalid IMAGE_JOB_TARGET", () => {
    process.env.IMAGE_JOB_TARGET = "both";
    expect(getImageJobTarget()).toBe("web");
  });

  it("defaults route concurrency to 1 and clamps invalid values", () => {
    expect(getImageRouteConcurrency()).toBe(1);
    process.env.IMAGE_ROUTE_CONCURRENCY = "2";
    expect(getImageRouteConcurrency()).toBe(2);
    process.env.IMAGE_ROUTE_CONCURRENCY = "4";
    expect(getImageRouteConcurrency()).toBe(1);
  });
});
