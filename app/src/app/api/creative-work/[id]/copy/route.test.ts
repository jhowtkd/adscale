import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const spendMock = vi.hoisted(() => vi.fn());
const getWorkMock = vi.hoisted(() => vi.fn());
const getProfileMock = vi.hoisted(() => vi.fn());
const getBrandKitMock = vi.hoisted(() => vi.fn());
const getOpenAIMock = vi.hoisted(() => vi.fn());
const setCopyMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: spendMock,
}));

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: getWorkMock,
  setCreativeWorkCopy: setCopyMock,
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: getProfileMock,
}));

vi.mock("@/server/db/repositories/brand-kit", () => ({
  getBrandKit: getBrandKitMock,
}));

vi.mock("@/server/ai/utils", () => ({
  getOpenAI: getOpenAIMock,
}));

import { getCreativeWork, setCreativeWorkCopy } from "@/server/repositories/creative-work";
import { getClientProfile } from "@/server/repositories/client-reference";
import { getBrandKit } from "@/server/db/repositories/brand-kit";

const mockGetCreativeWork = vi.mocked(getCreativeWork);
const mockSetCreativeWorkCopy = vi.mocked(setCreativeWorkCopy);
const mockGetClientProfile = vi.mocked(getClientProfile);
const mockGetBrandKit = vi.mocked(getBrandKit);

function makeParams(id: string) {
  return Promise.resolve({ id });
}

const profileId = "00000000-0000-4000-8000-000000000001";
const refId = "00000000-0000-4000-8000-000000000010";

const workItem = {
  id: "work-1",
  workspaceId: "workspace-1",
  clientProfileId: profileId,
  createdByUserId: "user-1",
  toolKind: "social_post",
  status: "ready",
  brief: {
    theme: "Tema",
    objective: "Objetivo",
    audience: "Publico",
    offer: "Oferta",
  },
  format: "4:5",
  copy: null,
  identitySnapshot: {
    clientProfileId: profileId,
    confirmedAt: "2026-07-07T00:00:00.000Z",
    assets: [],
    brandKit: {
      colors: [],
      fonts: [],
      toneOfVoice: null,
      prohibitedElements: null,
      requiredElements: null,
    },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const generatedCopy = {
  headline: "Headline gerada",
  body: "Body gerado",
  cta: "CTA gerada",
};

function buildOpenAIResponse(content: object) {
  return {
    choices: [{ message: { content: JSON.stringify(content) } }],
  };
}

describe("POST /api/creative-work/[id]/copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spendMock.mockResolvedValue(null);
    mockGetCreativeWork.mockResolvedValue({ work: workItem, outputs: [] });
    mockGetClientProfile.mockResolvedValue({
      id: profileId,
      workspaceId: "workspace-1",
      name: "Acme",
    } as never);
    mockGetBrandKit.mockResolvedValue(null);
    getOpenAIMock.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(buildOpenAIResponse(generatedCopy)),
        },
      },
    });
    mockSetCreativeWorkCopy.mockResolvedValue({
      ...workItem,
      copy: generatedCopy,
    } as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("charges exactly 2 credits under the work-item copy idempotency key", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/copy", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(200);
    expect(spendMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      action: "copy_generation",
      amount: 2,
      idempotencyKey: "creative-work:work-1:copy",
      metadata: { creativeWorkId: "work-1", operation_key: "copy_generation" },
      userId: "user-1",
      returnPath: "/quick-tools/create-post?workId=work-1",
    });
  });

  it("calls the OpenAI provider, persists the copy, and returns it", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/copy", { method: "POST" }),
      { params: makeParams("work-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.copy).toEqual(generatedCopy);
    expect(mockSetCreativeWorkCopy).toHaveBeenCalledWith(
      "workspace-1",
      "work-1",
      generatedCopy,
    );
  });

  it("returns the persisted copy on a repeat request without calling OpenAI again", async () => {
    mockGetCreativeWork.mockResolvedValue({
      work: { ...workItem, copy: generatedCopy },
      outputs: [],
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/copy", { method: "POST" }),
      { params: makeParams("work-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.copy).toEqual(generatedCopy);
    expect(getOpenAIMock).not.toHaveBeenCalled();
    expect(mockSetCreativeWorkCopy).not.toHaveBeenCalled();
    // Short-circuit: persisted copy means we already charged and generated.
    // No second spend, no second OpenAI call.
    expect(spendMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the work does not belong to the workspace", async () => {
    mockGetCreativeWork.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/copy", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(404);
    expect(spendMock).not.toHaveBeenCalled();
    expect(getOpenAIMock).not.toHaveBeenCalled();
  });

  it("returns 402 when spendOrApiError returns a blocking response", async () => {
    spendMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "noCredits" }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      }) as never,
    );

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/copy", { method: "POST" }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(402);
    expect(getOpenAIMock).not.toHaveBeenCalled();
    expect(mockSetCreativeWorkCopy).not.toHaveBeenCalled();
  });

  it("returns sanitized 502 when the provider fails after spend", async () => {
    getOpenAIMock.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error("openai blew up")),
        },
      },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/copy", { method: "POST" }),
      { params: makeParams("work-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.code).toBe("copyProviderUnavailable");
    // The work item must NOT be deleted on provider failure.
    expect(mockGetCreativeWork).toHaveBeenCalledTimes(1);
  });
});