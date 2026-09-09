import { describe, expect, it, vi } from "vitest";

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: mockLogger,
}));

import { logger } from "@/lib/logger";
import { observeImageCall } from "./image-call-observation";
import { LEGACY_IMAGE_POLICY } from "./image-render-policy";

describe("observeImageCall", () => {
  it("records usage even when response has no usable image", async () => {
    const usage = { input_tokens: 20, output_tokens: 10, cached_extra: { image: 2 } };
    const call = vi.fn().mockResolvedValue({ data: [], usage, _request_id: "req-1" });
    const result = await observeImageCall(LEGACY_IMAGE_POLICY, { key: "output-1", operation: "generate", size: "1088x1088" }, call);
    expect(result.observation.usage).toEqual(usage);
    expect(result.observation.requestId).toBe("req-1");
    expect(call).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: "image_api_call", status: "response", usage }));
  });
  it("records uncertain billing and never retries a rejected call", async () => {
    const error = new Error("timeout");
    const call = vi.fn().mockRejectedValue(error);
    await expect(observeImageCall(LEGACY_IMAGE_POLICY, { key: "output-2", operation: "edit", size: "1088x1360" }, call)).rejects.toBe(error);
    expect(call).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: "image_api_call", status: "error", usage: null, billing: "unknown" }));
  });
  it("still invokes the provider when started logging fails", async () => {
    vi.mocked(logger.info).mockClear();
    const response = { data: [{ b64_json: "img" }], usage: { output_tokens: 1 }, _request_id: "req-start" };
    const call = vi.fn().mockResolvedValue(response);
    vi.mocked(logger.info).mockImplementation((payload: { status?: string }) => {
      if (payload.status === "started") throw new Error("logger unavailable");
    });
    const result = await observeImageCall(
      LEGACY_IMAGE_POLICY,
      { key: "output-4", operation: "edit", size: "1088x1088" },
      call,
    );
    expect(call).toHaveBeenCalledOnce();
    expect(result.response).toBe(response);
    expect(result.observation.usage).toEqual({ output_tokens: 1 });
  });
  it("returns a billed success even if response logging fails", async () => {
    vi.mocked(logger.info).mockClear();
    const usage = { input_tokens: 4, output_tokens: 8 };
    const response = { data: [{ b64_json: "img" }], usage, _request_id: "req-ok" };
    const call = vi.fn().mockResolvedValue(response);
    vi.mocked(logger.info)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error("circular usage");
      });
    const result = await observeImageCall(
      LEGACY_IMAGE_POLICY,
      { key: "output-3", operation: "generate", size: "1088x1088" },
      call,
    );
    expect(result.response).toBe(response);
    expect(result.observation.usage).toEqual(usage);
    expect(call).toHaveBeenCalledOnce();
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "image_api_call", status: "error", billing: "unknown" }),
    );
  });
});
