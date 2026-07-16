import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const generateMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/application/generate-social-post-copy", () => ({
  generateSocialPostCopy: (...args: unknown[]) => generateMock(...args),
}));

function makeParams(id: string) {
  return Promise.resolve({ id });
}

const generatedCopy = {
  headline: "Headline gerada",
  body: "Body gerado",
  cta: "CTA gerada",
};

const work = {
  id: "work-1",
  workspaceId: "workspace-1",
  status: "draft",
  copy: generatedCopy,
};

const canonical = {
  id: "creative_work:work-1",
  originKind: "creative_work",
  intent: { kind: "social_post", objective: "x", formatHint: "4:5", platforms: [] },
  briefing: {
    headline: generatedCopy.headline,
    body: generatedCopy.body,
    cta: generatedCopy.cta,
  },
};

describe("POST /api/creative-work/[id]/copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateMock.mockResolvedValue({
      ok: true,
      value: { copy: generatedCopy, work, canonical },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delegates to generateSocialPostCopy and returns copy + work + canonical", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/copy", {
        method: "POST",
      }),
      { params: makeParams("work-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(generateMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      userId: "user-1",
      returnPath: "/quick-tools/create-post?workId=work-1",
    });
    expect(body.copy).toEqual(generatedCopy);
    expect(body.work.id).toBe("work-1");
    expect(body.canonical.id).toBe("creative_work:work-1");
  });

  it("maps work_not_found → 404", async () => {
    generateMock.mockResolvedValue({
      ok: false,
      error: { code: "work_not_found" },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/copy", {
        method: "POST",
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(404);
  });

  it("maps credit_blocked → 402", async () => {
    generateMock.mockResolvedValue({
      ok: false,
      error: {
        code: "credit_blocked",
        spend: {
          ok: false,
          status: 402,
          conversionPayload: { reason: "noCredits" },
        },
      },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/copy", {
        method: "POST",
      }),
      { params: makeParams("work-1") }
    );

    expect(res.status).toBe(402);
  });

  it("maps provider_unavailable → 502", async () => {
    generateMock.mockResolvedValue({
      ok: false,
      error: { code: "provider_unavailable" },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/copy", {
        method: "POST",
      }),
      { params: makeParams("work-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.code).toBe("copyProviderUnavailable");
  });
});
