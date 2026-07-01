import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./record", () => ({
  recordBetaAnalyticsEvent: vi.fn(() => Promise.resolve({ id: "event-1" })),
}));

import { recordBetaAnalyticsEvent } from "./record";
import {
  emitDerivationAutoRetryOutcome,
  emitDerivationAutoRetryTriggered,
} from "./derivation-auto-retry-telemetry";

const mockRecord = vi.mocked(recordBetaAnalyticsEvent);

const CONTEXT = {
  workspaceId: "ws-1",
  userId: "user-1",
  campaignId: "camp-1",
  derivationId: "deriv-1",
  generationMode: "art_variation",
  targetFormat: "1:1",
  isPreview: false,
};

describe("derivation auto-retry telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records derivation_auto_retry_triggered with failure codes", async () => {
    emitDerivationAutoRetryTriggered(CONTEXT, ["cta_drift", "unreadable_required_text"]);
    await vi.waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "derivation_auto_retry_triggered",
        source: "server",
        properties: {
          operation: "art_variation",
          format: "1:1",
          reasonCode: "cta_drift,unreadable_required_text",
        },
      })
    );
  });

  it("records derivation_auto_retry_succeeded when failures clear", async () => {
    emitDerivationAutoRetryOutcome(CONTEXT, ["cta_drift"], []);
    await vi.waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "derivation_auto_retry_succeeded",
        properties: expect.objectContaining({ reasonCode: "cleared" }),
      })
    );
  });

  it("records derivation_auto_retry_unchanged when failures remain", async () => {
    emitDerivationAutoRetryOutcome(
      CONTEXT,
      ["cta_drift"],
      [{ code: "cta_drift", message: "still wrong" }]
    );
    await vi.waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));

    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "derivation_auto_retry_unchanged",
        properties: expect.objectContaining({ reasonCode: "cta_drift" }),
      })
    );
  });
});
