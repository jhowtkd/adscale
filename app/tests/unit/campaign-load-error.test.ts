import { describe, it, expect } from "vitest";
import {
  classifyLoadError,
  createLoadError,
  getLoadErrorKind,
  isLoadError,
  CampaignLoadError,
} from "@/lib/campaign-load-error";

describe("campaign-load-error", () => {
  it("classifies workspace errors from 403 and codes", () => {
    expect(classifyLoadError({ status: 403, code: "noWorkspace" })).toBe("workspace");
    expect(classifyLoadError({ status: 403, code: "forbidden" })).toBe("workspace");
  });

  it("classifies not found from 404 and campaignNotFound code", () => {
    expect(classifyLoadError({ status: 404, code: "campaignNotFound" })).toBe("not_found");
  });

  it("classifies server errors from 5xx and known codes", () => {
    expect(classifyLoadError({ status: 500, code: "internalError" })).toBe("server");
    expect(classifyLoadError({ status: 503, code: "generationWorkerUnavailable" })).toBe("server");
  });

  it("classifies timeout from AbortError and TimeoutError", () => {
    expect(
      classifyLoadError({ cause: new DOMException("Timed out", "TimeoutError") })
    ).toBe("timeout");
    expect(classifyLoadError({ cause: new Error("The operation was aborted") })).toBe("timeout");
  });

  it("creates typed load errors with kind metadata", () => {
    const error = createLoadError("Campaign missing", {
      status: 404,
      code: "campaignNotFound",
    });

    expect(isLoadError(error)).toBe(true);
    expect(error).toBeInstanceOf(CampaignLoadError);
    expect(error.kind).toBe("not_found");
    expect(error.code).toBe("campaignNotFound");
    expect(getLoadErrorKind(error)).toBe("not_found");
  });

  it("falls back to unknown for unclassified responses", () => {
    expect(classifyLoadError({ status: 418 })).toBe("unknown");
    expect(getLoadErrorKind(new Error("Something else"))).toBe("unknown");
  });
});
