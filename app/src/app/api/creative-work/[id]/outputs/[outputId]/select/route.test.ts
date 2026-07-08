import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const getWorkMock = vi.hoisted(() => vi.fn());
const selectOutputMock = vi.hoisted(() => vi.fn());
const getByKeyMock = vi.hoisted(() => vi.fn());
const createAssetMock = vi.hoisted(() => vi.fn());
const headMock = vi.hoisted(() => vi.fn());

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
  selectCreativeWorkOutput: (...args: unknown[]) => selectOutputMock(...args),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetByKey: (...args: unknown[]) => getByKeyMock(...args),
  createWorkspaceAsset: (...args: unknown[]) => createAssetMock(...args),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    head: (...args: unknown[]) => headMock(...args),
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
    theme: "Tema do Post",
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

describe("POST /api/creative-work/[id]/outputs/[outputId]/select", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headMock.mockResolvedValue({ contentLength: 12345, contentType: "image/png" });
    getByKeyMock.mockResolvedValue(null);
    selectOutputMock.mockResolvedValue({ ...completedOutput, isSelected: true });
    createAssetMock.mockResolvedValue({ id: "asset-1", key: completedOutput.outputKey });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects a completed output and saves it to the workspace library by default", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [completedOutput] });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: makeParams("work-1", "output-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.output.isSelected).toBe(true);
    expect(selectOutputMock).toHaveBeenCalledWith("workspace-1", "work-1", "output-1");
    expect(createAssetMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "Post Tema do Post - balanced",
      key: completedOutput.outputKey,
      type: "image/png",
      size: 12345,
      source: "creative_work",
    });
  });

  it("does NOT call createWorkspaceAsset when getWorkspaceAssetByKey returns an existing entry", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [completedOutput] });
    getByKeyMock.mockResolvedValue({
      id: "asset-existing",
      workspaceId: "workspace-1",
      key: completedOutput.outputKey,
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(200);
    expect(createAssetMock).not.toHaveBeenCalled();
  });

  it("skips library save when saveToLibrary=false", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [completedOutput] });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saveToLibrary: false }),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(200);
    expect(getByKeyMock).not.toHaveBeenCalled();
    expect(createAssetMock).not.toHaveBeenCalled();
  });

  it("uses zero size when the storage object head lookup returns null", async () => {
    headMock.mockResolvedValueOnce(null);
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [completedOutput] });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(200);
    expect(createAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({ size: 0 }),
    );
  });

  it("returns 404 when the work is missing", async () => {
    getWorkMock.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(404);
    expect(selectOutputMock).not.toHaveBeenCalled();
    expect(createAssetMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the output is missing", async () => {
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [] });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(404);
    expect(selectOutputMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the output is not completed", async () => {
    getWorkMock.mockResolvedValue({
      work: workItem,
      outputs: [{ ...completedOutput, status: "processing" }],
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(409);
    expect(selectOutputMock).not.toHaveBeenCalled();
    expect(createAssetMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work/work-1/outputs/output-1/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saveToLibrary: "yes" }),
      }),
      { params: makeParams("work-1", "output-1") }
    );

    expect(res.status).toBe(400);
  });
});