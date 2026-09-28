import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveEquipeBatch,
  approveEquipeItem,
  cancelEquipeScheduled,
  confirmEquipeBusinessFact,
  declineEquipePublish,
  editEquipeCaption,
  EquipeCommandError,
  parseBatchResults,
  pauseEquipePublications,
  reportEquipeItemProblem,
  requestEquipeAdjustment,
  requestEquipeSupport,
} from "./commands";
import { apiFetch } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedFetch = vi.mocked(apiFetch);

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function errResponse(code: string, status = 409) {
  return { ok: false, status, json: async () => ({ error: code, code }) } as Response;
}

describe("equipe commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the closed list to approve_batch", async () => {
    mockedFetch.mockResolvedValueOnce(okResponse({ results: [] }));
    await approveEquipeBatch("acc-1", [
      { itemId: "item-1", versionHash: "v1" },
      { itemId: "item-2", versionHash: "v2" },
    ]);
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/equipe/accounts/acc-1/commands",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "approve_batch",
          payload: {
            items: [
              { itemId: "item-1", versionHash: "v1" },
              { itemId: "item-2", versionHash: "v2" },
            ],
          },
        }),
      }),
    );
  });

  it("binds approve_item to the exact version hash", async () => {
    mockedFetch.mockResolvedValueOnce(okResponse({ receiptId: "r1" }));
    await approveEquipeItem("acc-1", { itemId: "item-1", versionHash: "hash-9" });
    expect(mockedFetch).toHaveBeenCalledWith(
      "/api/equipe/accounts/acc-1/commands",
      expect.objectContaining({
        body: JSON.stringify({
          type: "approve_item",
          payload: { itemId: "item-1", expectedVersionHash: "hash-9" },
        }),
      }),
    );
  });

  it("sends categorized adjustments, edits, declines, cancels, confirms and reports", async () => {
    mockedFetch.mockResolvedValue(okResponse({}));
    await requestEquipeAdjustment("acc-1", { itemId: "i", category: "visual", note: "crop" });
    await editEquipeCaption("acc-1", { itemId: "i", caption: "new" });
    await confirmEquipeBusinessFact("acc-1", { itemId: "i", expectedVersionHash: "h" });
    await declineEquipePublish("acc-1", { itemId: "i", reason: "off-brand" });
    await cancelEquipeScheduled("acc-1", { itemId: "i" });
    await reportEquipeItemProblem("acc-1", { itemId: "i", note: "wrong price" });
    const types = mockedFetch.mock.calls.map(([, init]) =>
      (JSON.parse((init?.body as string) ?? "{}") as { type: string }).type,
    );
    expect(types).toEqual([
      "request_adjustment",
      "edit_caption",
      "confirm_business_fact",
      "decline_publish",
      "cancel_scheduled",
      "report_item_problem",
    ]);
    const adjustment = JSON.parse(mockedFetch.mock.calls[0]![1]?.body as string) as {
      payload: Record<string, unknown>;
    };
    expect(adjustment.payload).toEqual({ itemId: "i", category: "visual", note: "crop" });
  });

  it("sends pause_publications and request_support without smuggled scope", async () => {
    mockedFetch.mockResolvedValue(okResponse({}));
    await pauseEquipePublications("acc-1", {});
    await requestEquipeSupport("acc-1", { note: "help" });
    for (const [, init] of mockedFetch.mock.calls) {
      const body = JSON.parse((init?.body as string) ?? "{}") as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(["payload", "type"]);
    }
    const support = JSON.parse(mockedFetch.mock.calls[1]![1]?.body as string) as {
      type: string;
      payload: Record<string, unknown>;
    };
    expect(support).toEqual({ type: "request_support", payload: { note: "help" } });
  });

  it("surfaces the module error code for stale versions", async () => {
    mockedFetch.mockResolvedValueOnce(errResponse("version_mismatch"));
    const error = await approveEquipeItem("acc-1", { itemId: "i", versionHash: "stale" }).catch(
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(EquipeCommandError);
    expect((error as EquipeCommandError).code).toBe("version_mismatch");
    expect((error as EquipeCommandError).status).toBe(409);
  });

  it("parses per-item batch results defensively", () => {
    expect(
      parseBatchResults({
        results: [
          { itemId: "a", outcome: "approved", receiptId: "r1" },
          { itemId: "b", outcome: "changed_since_opened" },
          { itemId: "c", outcome: "not_ready", reviewStatus: "blocked" },
          { itemId: "d", outcome: "already_decided", receiptId: "r2" },
          { itemId: "e", outcome: "unknown_item" },
          { itemId: "x", outcome: "bogus" },
          null,
        ],
      }),
    ).toEqual([
      { itemId: "a", outcome: "approved", receiptId: "r1" },
      { itemId: "b", outcome: "changed_since_opened" },
      { itemId: "c", outcome: "not_ready", reviewStatus: "blocked" },
      { itemId: "d", outcome: "already_decided", receiptId: "r2" },
      { itemId: "e", outcome: "unknown_item" },
    ]);
    expect(parseBatchResults(null)).toEqual([]);
    expect(parseBatchResults({})).toEqual([]);
  });
});
