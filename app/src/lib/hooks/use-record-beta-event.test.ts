import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { BETA_SESSION_STORAGE_KEY } from "@/lib/beta-analytics/constants";
import { useRecordBetaEvent } from "./use-record-beta-event";

describe("useRecordBetaEvent", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReturnValue(Promise.resolve({ ok: true }));
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("posts to /api/analytics/events with eventKey and properties", () => {
    const { result } = renderHook(() => useRecordBetaEvent("camp-1"));

    act(() => {
      result.current.recordEvent("cockpit_stage_entered", {
        stage: "guided_briefing",
        missionKey: "guided_briefing",
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analytics/events",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventKey: "cockpit_stage_entered",
          campaignId: "camp-1",
          sessionId: undefined,
          properties: {
            stage: "guided_briefing",
            missionKey: "guided_briefing",
          },
        }),
      })
    );
  });

  it("includes sessionId from sessionStorage when BETA_SESSION_STORAGE_KEY is set", () => {
    sessionStorage.setItem(BETA_SESSION_STORAGE_KEY, "sess-uuid-123");
    const { result } = renderHook(() => useRecordBetaEvent("camp-1"));

    act(() => {
      result.current.recordEvent("cockpit_stage_entered");
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.sessionId).toBe("sess-uuid-123");
  });

  it("includes campaignId from hook argument", () => {
    const { result } = renderHook(() => useRecordBetaEvent("camp-99"));

    act(() => {
      result.current.recordEvent("cockpit_stage_completed");
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.campaignId).toBe("camp-99");
  });

  it("does not throw when fetch rejects", () => {
    fetchMock.mockReturnValue(Promise.reject(new Error("network")));
    const { result } = renderHook(() => useRecordBetaEvent("camp-1"));

    expect(() => {
      act(() => {
        result.current.recordEvent("cockpit_stage_entered");
      });
    }).not.toThrow();
  });

  it("includes stage and missionKey in properties when passed", () => {
    const { result } = renderHook(() => useRecordBetaEvent("camp-1"));

    act(() => {
      result.current.recordEvent("cockpit_stage_abandoned", {
        stage: "strategy_recipe",
        missionKey: "strategy_recipe",
      });
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.properties).toEqual({
      stage: "strategy_recipe",
      missionKey: "strategy_recipe",
    });
  });
});
