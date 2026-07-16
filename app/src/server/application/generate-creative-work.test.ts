import { beforeEach, describe, expect, it, vi } from "vitest";

const getWork = vi.hoisted(() => vi.fn());
const prepare = vi.hoisted(() => vi.fn());
const options = vi.hoisted(() => vi.fn());
const snapshot = vi.hoisted(() => vi.fn());
const confirm = vi.hoisted(() => vi.fn());
const charge = vi.hoisted(() => vi.fn());
const createOutputs = vi.hoisted(() => vi.fn());
const setStatus = vi.hoisted(() => vi.fn());
const failOutput = vi.hoisted(() => vi.fn());
const refreshStatus = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());
const refund = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: getWork,
  confirmCreativeWorkIdentity: confirm,
  createPlannedCreativeWorkOutputs: createOutputs,
  setCreativeWorkStatus: setStatus,
  failCreativeWorkOutput: failOutput,
  refreshCreativeWorkStatus: refreshStatus,
}));
vi.mock("./prepare-creative-work", () => ({ prepareCreativeWork: prepare }));
vi.mock("@/server/creative-work/identity", () => ({
  buildIdentityOptions: options,
  createIdentitySnapshot: snapshot,
}));
vi.mock("@/server/generation/canonical/charge", () => ({ chargeForGenerationBatch: charge }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send } }));
vi.mock("@/server/billing/credits", () => ({ refundCredits: refund }));

import { generateCreativeWork } from "./generate-creative-work";

const work = {
  id: "work-1", workspaceId: "ws-1", clientProfileId: "profile-1", createdByUserId: "user-1",
  toolKind: "variations", status: "draft", request: "latest", format: "4:5",
  settings: { targetFormats: [] }, brief: null, copy: null, inputSnapshot: null, identitySnapshot: null,
};
const preparedWork = {
  ...work,
  brief: { theme: "Tema", objective: "Objetivo", audience: "Público", offer: "Oferta" },
  copy: { headline: "H", body: "B", cta: "C" },
  inputSnapshot: { request: "latest", settings: { targetFormats: [] }, sources: [{ sourceId: "source-1", usage: "content", content: { subject: "x" } }] },
};
const identitySnapshot = { clientProfileId: "profile-1", confirmedAt: "now", assets: [], brandKit: { colors: [], fonts: [], toneOfVoice: null, requiredElements: null, prohibitedElements: null } };
const rows = ["a", "b", "c"].map((id, index) => ({ id, creativeLevel: ["conservative", "balanced", "bold"][index], targetFormat: "4:5", status: "queued" }));

describe("generateCreativeWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWork.mockResolvedValue({ work, outputs: [], sources: [] });
    prepare.mockResolvedValue({ ok: true, value: { work: preparedWork, quote: { plans: [], unitCount: 0, credits: 0 } } });
    options.mockResolvedValue([{ referenceId: "ref-3" }, { referenceId: "ref-1" }, { referenceId: "ref-2" }, { referenceId: "ref-4" }]);
    snapshot.mockResolvedValue(identitySnapshot);
    confirm.mockResolvedValue({ ...preparedWork, status: "ready", identitySnapshot });
    charge.mockResolvedValue({ ok: true, creditsSpent: 15 });
    createOutputs.mockResolvedValue({ outputs: rows, newlyCreatedIds: rows.map((row) => row.id) });
    send.mockResolvedValue(undefined);
    setStatus.mockResolvedValue({ ...preparedWork, status: "generating", identitySnapshot });
    failOutput.mockResolvedValue(null);
    refreshStatus.mockResolvedValue("failed");
    refund.mockResolvedValue({ status: "refunded" });
  });

  it("prepares, snapshots the ranked top three, charges the quote, and dispatches only IDs", async () => {
    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(result.ok).toBe(true);
    expect(snapshot).toHaveBeenCalledWith({ workspaceId: "ws-1", clientProfileId: "profile-1", selectedReferenceIds: ["ref-3", "ref-1", "ref-2"] });
    expect(charge).toHaveBeenCalledWith(expect.objectContaining({ unitCount: 3, chargeAmount: 15, unitChargeAmount: 5, billingKey: "creative-work:work-1:initial" }), expect.anything());
    expect(createOutputs).toHaveBeenCalledWith("ws-1", "work-1", [
      { creativeLevel: "conservative", targetFormat: "4:5", versionNumber: 1 },
      { creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 },
      { creativeLevel: "bold", targetFormat: "4:5", versionNumber: 1 },
    ]);
    expect(send).toHaveBeenCalledWith(rows.map((row) => ({ name: "creative-work.generate", data: { workspaceId: "ws-1", workItemId: "work-1", outputId: row.id } })));
  });

  it("allows Brand-Kit-only generation and returns a non-blocking suggestion", async () => {
    options.mockResolvedValue([]);
    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(result).toMatchObject({ ok: true, value: { brandTrainingSuggestion: expect.any(String) } });
    expect(snapshot).toHaveBeenCalledWith(expect.objectContaining({ selectedReferenceIds: [] }));
  });

  it("returns persisted rows without new spend or dispatch on repeated HTTP confirmation", async () => {
    getWork.mockResolvedValue({ work: { ...preparedWork, status: "generating", identitySnapshot }, outputs: rows, sources: [] });
    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(result).toMatchObject({ ok: true, value: { outputs: rows, billingKey: "creative-work:work-1:initial" } });
    expect(charge).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("charges five credits for one single output", async () => {
    getWork.mockResolvedValue({ work: { ...work, toolKind: "single" }, outputs: [], sources: [] });
    prepare.mockResolvedValue({ ok: true, value: { work: { ...preparedWork, toolKind: "single" }, quote: {} } });
    createOutputs.mockResolvedValue({ outputs: [rows[1]], newlyCreatedIds: [rows[1].id] });
    await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(charge).toHaveBeenCalledWith(expect.objectContaining({ unitCount: 1, chargeAmount: 5 }), expect.anything());
  });

  it("fails newly-created rows and refunds the exact quote when dispatch fails", async () => {
    send.mockRejectedValue(new Error("transport down"));
    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(result).toMatchObject({ ok: false, error: { code: "dispatch_failed" } });
    expect(failOutput).toHaveBeenCalledTimes(3);
    expect(refreshStatus).toHaveBeenCalledWith("ws-1", "work-1");
    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ amount: 15, idempotencyKey: "creative-work:work-1:initial:dispatch-refund" }));
  });

  it("resumes a frozen ready work after a previously blocked charge", async () => {
    getWork.mockResolvedValue({ work: { ...preparedWork, status: "ready", identitySnapshot }, outputs: [], sources: [] });
    const result = await generateCreativeWork({ workspaceId: "ws-1", workItemId: "work-1", userId: "user-1" });
    expect(result.ok).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
    expect(options).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
    expect(charge).toHaveBeenCalledOnce();
  });
});
