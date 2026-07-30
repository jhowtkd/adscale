import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PATCH } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

const getWorkMock = vi.hoisted(() => vi.fn());
const updateDraftMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getWorkMock(...args),
  updateCreativeWorkDraft: (...args: unknown[]) => updateDraftMock(...args),
}));

function makeParams(id: string) {
  return Promise.resolve({ id });
}

function requestPatch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/creative-work/work-1/directions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: makeParams("work-1") }
  );
}

const workItem = {
  id: "work-1",
  workspaceId: "workspace-1",
  clientProfileId: "00000000-0000-4000-8000-000000000001",
  createdByUserId: "user-1",
  toolKind: "social_post",
  status: "draft",
  request: "Pedido",
  format: "4:5",
  settings: { targetFormats: [] },
  brief: null,
  copy: null,
  identitySnapshot: null,
  inputSnapshot: null,
  createdAt: new Date("2026-07-13T12:00:00.000Z"),
  updatedAt: new Date("2026-07-13T12:00:00.000Z"),
};

function makeDirection(overrides: Partial<{
  id: string;
  label: string;
  instruction: string;
  order: number;
  safetyBand: "safe" | "experimental";
  provenance: "default" | "ai-suggestion" | "manual";
}> = {}) {
  return {
    id: `direction-${overrides.order ?? 0}`,
    label: "Direction",
    instruction: "Make it bold",
    order: 0,
    safetyBand: "experimental" as const,
    provenance: "manual" as const,
    ...overrides,
  };
}

describe("PATCH /api/creative-work/[id]/directions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [] });
    updateDraftMock.mockResolvedValue(workItem);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists the direction pool on a draft and returns the updated work", async () => {
    const directionPool = {
      version: 1,
      directions: [
        makeDirection({ id: "d1", order: 0 }),
        makeDirection({ id: "d2", order: 1 }),
      ],
      selectedIds: ["d1"],
      manualInstruction: "Global instruction",
    };
    const updatedWork = { ...workItem, settings: { ...workItem.settings, directionPool } };
    updateDraftMock.mockResolvedValue(updatedWork);

    const res = await requestPatch({ directionPool });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(updateDraftMock).toHaveBeenCalledWith("workspace-1", "work-1", {
      settings: { targetFormats: [], directionPool },
    });
    expect(body.work.settings.directionPool).toEqual(directionPool);
  });

  it("rejects a non-draft work with 409", async () => {
    getWorkMock.mockResolvedValue({ work: { ...workItem, status: "ready" }, outputs: [], sources: [] });
    const res = await requestPatch({
      directionPool: {
        version: 1,
        directions: [makeDirection({ id: "d1" })],
        selectedIds: ["d1"],
        manualInstruction: null,
      },
    });
    expect(res.status).toBe(409);
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate direction ids", async () => {
    const res = await requestPatch({
      directionPool: {
        version: 1,
        directions: [
          makeDirection({ id: "d1", order: 0 }),
          makeDirection({ id: "d1", order: 1 }),
        ],
        selectedIds: ["d1"],
        manualInstruction: null,
      },
    });
    expect(res.status).toBe(400);
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it("rejects selected ids outside the pool", async () => {
    const res = await requestPatch({
      directionPool: {
        version: 1,
        directions: [makeDirection({ id: "d1" })],
        selectedIds: ["d1", "d2"],
        manualInstruction: null,
      },
    });
    expect(res.status).toBe(400);
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it("rejects more than five selected ids", async () => {
    const directions = Array.from({ length: 6 }, (_, index) => makeDirection({ id: `d${index}`, order: index }));
    const res = await requestPatch({
      directionPool: {
        version: 1,
        directions,
        selectedIds: directions.map((d) => d.id),
        manualInstruction: null,
      },
    });
    expect(res.status).toBe(400);
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it("rejects zero selected ids", async () => {
    const res = await requestPatch({
      directionPool: {
        version: 1,
        directions: [makeDirection({ id: "d1" })],
        selectedIds: [],
        manualInstruction: null,
      },
    });
    expect(res.status).toBe(400);
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it("rejects a missing workspace-scoped work with 404", async () => {
    getWorkMock.mockResolvedValue(null);
    const res = await requestPatch({
      directionPool: {
        version: 1,
        directions: [makeDirection({ id: "d1" })],
        selectedIds: ["d1"],
        manualInstruction: null,
      },
    });
    expect(res.status).toBe(404);
    expect(updateDraftMock).not.toHaveBeenCalled();
  });

  it("allows manualInstruction as a string or null", async () => {
    for (const manualInstruction of ["Do this", null]) {
      vi.clearAllMocks();
      getWorkMock.mockResolvedValue({ work: workItem, outputs: [], sources: [] });
      updateDraftMock.mockResolvedValue(workItem);
      const directionPool = {
        version: 1,
        directions: [makeDirection({ id: "d1" })],
        selectedIds: ["d1"],
        manualInstruction,
      };
      const res = await requestPatch({ directionPool });
      expect(res.status).toBe(200);
      expect(updateDraftMock).toHaveBeenCalledWith("workspace-1", "work-1", {
        settings: { targetFormats: [], directionPool },
      });
    }
  });
});
