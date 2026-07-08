import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const getWorkMock = vi.hoisted(() => vi.fn());
const signedUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getWorkMock(...args),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    signedDownloadUrl: (...args: unknown[]) => signedUrlMock(...args),
  },
}));

function makeParams(id: string, outputId: string) {
  return Promise.resolve({ id, outputId });
}

const workItem = {
  id: "work-1",
  workspaceId: "workspace-1",
  clientProfileId: "profile-1",
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
  copy: { headline: "H", body: "B", cta: "C" },
  identitySnapshot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const completedOutput = {
  id: "output-1",
  workspaceId: "workspace-1",
  workItemId: "work-1",
  creativeLevel: "balanced",
  status: "completed",
  outputKey: "creative-work/output-1/1700000000000.png",
  cost: 5,
  failureCode: null,
  quality: null,
  isSelected: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GET /api/creative-work/[id]/outputs/[outputId]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedUrlMock.mockResolvedValue("https://signed.example.com/asset.png");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a signed download URL for a completed output", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [completedOutput] });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download"),
      { params: makeParams("work-1", "output-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toBe("https://signed.example.com/asset.png");
    expect(signedUrlMock).toHaveBeenCalledWith(completedOutput.outputKey);
  });

  it("returns 404 when the work is missing", async () => {
    getWorkMock.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download"),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(404);
    expect(signedUrlMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the output is missing", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [] });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download"),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(404);
    expect(signedUrlMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the output is not completed", async () => {
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [{ ...completedOutput, status: "failed", outputKey: null }],
    });

    const res = await GET(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/download"),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(409);
    expect(signedUrlMock).not.toHaveBeenCalled();
  });
});