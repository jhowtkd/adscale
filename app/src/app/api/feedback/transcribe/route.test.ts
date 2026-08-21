import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(async () => ({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })),
  checkRateLimit: vi.fn(async (): Promise<Response | null> => null),
  createTranscription: vi.fn(async () => ({ text: "  Texto ditado.  " })),
  handleApiError: vi.fn(() => Response.json({ code: "internalError" }, { status: 500 })),
}));

vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: mocks.requireWorkspaceAccess }));
vi.mock("@/lib/with-rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/api-response", () => ({
  apiError: vi.fn((code: string, status: number) => Response.json({ code }, { status })),
  handleApiError: mocks.handleApiError,
}));
vi.mock("@/server/ai/utils", () => ({ getOpenAI: () => ({ audio: { transcriptions: { create: mocks.createTranscription } } }) }));

import { POST } from "./route";

function requestWithFile(content: BlobPart = "audio", type = "audio/webm", headers?: HeadersInit) {
  const form = new FormData();
  form.set("file", new File([content], "feedback.webm", { type }));
  return new Request("http://localhost/api/feedback/transcribe", { method: "POST", headers, body: form });
}

describe("POST /api/feedback/transcribe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("transcribes an allowed workspace-scoped audio file", async () => {
    const response = await POST(requestWithFile());
    expect(response.status).toBe(200);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(expect.any(Request), { category: "ai", workspaceId: "workspace-1" });
    expect(mocks.createTranscription).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-4o-mini-transcribe", language: "pt", response_format: "json" }));
    await expect(response.json()).resolves.toEqual({ text: "Texto ditado." });
  });

  it("accepts browser codec parameters after normalizing the base MIME", async () => {
    expect((await POST(requestWithFile("audio", "audio/webm;codecs=opus"))).status).toBe(200);
  });

  it.each(["text/plain", "application/octet-stream"])("rejects %s", async (type) => {
    expect((await POST(requestWithFile("not audio", type))).status).toBe(400);
    expect(mocks.createTranscription).not.toHaveBeenCalled();
  });

  it("rejects empty audio and payloads larger than 10 MB", async () => {
    expect((await POST(requestWithFile(""))).status).toBe(400);
    expect((await POST(requestWithFile(new Uint8Array(10 * 1024 * 1024 + 1)))).status).toBe(413);
    expect(mocks.createTranscription).not.toHaveBeenCalled();
  });

  it("bounds the entire multipart body despite absent or misleading content lengths", async () => {
    const oversizedBody = new Uint8Array(11 * 1024 * 1024 + 1);
    expect((await POST(requestWithFile(oversizedBody))).status).toBe(413);
    expect((await POST(requestWithFile(oversizedBody, "audio/webm", { "content-length": "1" }))).status).toBe(413);
    expect((await POST(requestWithFile("audio", "audio/webm", { "content-length": String(12 * 1024 * 1024) }))).status).toBe(413);
    expect(mocks.createTranscription).not.toHaveBeenCalled();
  });

  it("rejects extra multipart parts instead of ignoring them", async () => {
    const form = new FormData();
    form.set("file", new File(["audio"], "feedback.webm", { type: "audio/webm" }));
    form.set("extra", "ignored before this boundary");
    expect((await POST(new Request("http://localhost/api/feedback/transcribe", { method: "POST", body: form }))).status).toBe(400);
    expect(mocks.createTranscription).not.toHaveBeenCalled();
  });

  it("returns 422 when no speech is recognized", async () => {
    mocks.createTranscription.mockResolvedValueOnce({ text: "   " });
    expect((await POST(requestWithFile())).status).toBe(422);
  });

  it("does not call the provider when rate limited", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await POST(requestWithFile())).status).toBe(429);
    expect(mocks.createTranscription).not.toHaveBeenCalled();
  });

  it("hides provider failures without serializing or logging them", async () => {
    mocks.createTranscription.mockRejectedValueOnce(new Error("provider secret"));
    const response = await POST(requestWithFile());
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ code: "internalError" });
    expect(mocks.handleApiError).not.toHaveBeenCalled();
  });
});
