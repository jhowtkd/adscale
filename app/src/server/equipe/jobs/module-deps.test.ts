// Spec 2026-10-07 §3: a job reads the free plan as the request does, so the classic paid access travels into its module deps.
import { describe, expect, it, vi } from "vitest";
import { createMemoryEquipeStore, createMemoryEquipeUnitOfWork } from "../data";
import { fixedClock } from "../domain";
import { moduleDepsFor, type EquipeJobDeps } from "./shared";

function jobDeps(extra: Partial<EquipeJobDeps> = {}): EquipeJobDeps {
  return {
    uow: createMemoryEquipeUnitOfWork(createMemoryEquipeStore()),
    clock: fixedClock(new Date("2026-10-07T12:00:00.000Z")),
    isEnabledForWorkspace: () => true,
    gatewayFor: () => ({}) as never,
    ...extra,
  };
}

describe("moduleDepsFor (spec 2026-10-07 §3)", () => {
  it("passes the classic paid access on", async () => {
    const hasClassicPaidAccess = vi.fn(async () => true);
    const deps = moduleDepsFor(jobDeps({ hasClassicPaidAccess }), "ws-1");
    expect(await deps.hasClassicPaidAccess?.("ws-1")).toBe(true);
    expect(hasClassicPaidAccess).toHaveBeenCalledWith("ws-1");
  });

  it("leaves it out when the job deps have none", () => {
    expect(moduleDepsFor(jobDeps(), "ws-1").hasClassicPaidAccess).toBeUndefined();
  });
});
