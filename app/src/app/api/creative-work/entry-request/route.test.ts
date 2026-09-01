import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const synthesizeMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() => Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })),
}));
vi.mock("@/lib/with-rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));
vi.mock("@/server/application/synthesize-studio-entry-request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/application/synthesize-studio-entry-request")>();
  return {
    ...actual,
    synthesizeStudioEntryRequest: (...args: unknown[]) => synthesizeMock(...args),
  };
});

import { POST } from "./route";

const validBody = {
  facts: {
    protocol: "single" as const,
    offer: "imersão NR-1",
    audience: null,
    tone: "institucional",
  },
  chips: {},
  locale: "pt-BR" as const,
};

function postEntryRequest(body: unknown) {
  return POST(new Request("http://localhost/api/creative-work/entry-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}

describe("POST /api/creative-work/entry-request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue(null);
    synthesizeMock.mockResolvedValue({
      sentence: "Peça única de imersão NR-1, tom institucional.",
      requestSource: "template",
    });
  });

  it("returns 200 with sentence and requestSource on success", async () => {
    const response = await postEntryRequest(validBody);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      sentence: "Peça única de imersão NR-1, tom institucional.",
      requestSource: "template",
    });
    expect(synthesizeMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      facts: validBody.facts,
      chips: {},
      locale: "pt-BR",
    });
  });

  it("rate-limits with the ai category before synthesizing", async () => {
    const limited = NextResponse.json({ error: "rate limited" }, { status: 429 });
    checkRateLimitMock.mockResolvedValueOnce(limited);

    const response = await postEntryRequest(validBody);

    expect(checkRateLimitMock).toHaveBeenCalledWith(
      expect.any(Request),
      { category: "ai", workspaceId: "workspace-1" },
    );
    expect(response.status).toBe(429);
    expect(synthesizeMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the body has extra keys", async () => {
    const response = await postEntryRequest({ ...validBody, extra: "field" });
    expect(response.status).toBe(400);
    expect(synthesizeMock).not.toHaveBeenCalled();
  });

  it("returns 400 when a string field exceeds 240 characters", async () => {
    const response = await postEntryRequest({
      ...validBody,
      facts: { ...validBody.facts, offer: "x".repeat(241) },
    });
    expect(response.status).toBe(400);
    expect(synthesizeMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    const response = await postEntryRequest("{ not valid json");
    expect(response.status).toBe(400);
    expect(synthesizeMock).not.toHaveBeenCalled();
  });

  it("does not persist anything — only calls the synthesize use-case", async () => {
    await postEntryRequest(validBody);
    expect(synthesizeMock).toHaveBeenCalledTimes(1);
  });
});
