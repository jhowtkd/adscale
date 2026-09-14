import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";

const accessMock = vi.hoisted(() => vi.fn());
const getWorkMock = vi.hoisted(() => vi.fn());
const getReferencesMock = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: (...args: unknown[]) => accessMock(...args),
}));

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => getWorkMock(...args),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getTrainingReferences: (...args: unknown[]) => getReferencesMock(...args),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: { publicUrl: (key: string) => `https://cdn.test/${key}` },
}));

function params(id = "work-1", outputId = "output-1") {
  return Promise.resolve({ id, outputId });
}

const snapshotPerson = {
  personId: "11111111-1111-4111-8111-111111111111",
  name: "Ana",
  referenceIds: ["ref-1", "ref-2"],
  primaryReferenceId: "ref-1",
  preserve: [],
};

describe("GET person-references (plan 03, T3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    });
    getWorkMock.mockResolvedValue({
      work: { id: "work-1", clientProfileId: "profile-1", inputSnapshot: { people: [snapshotPerson] } },
      outputs: [{ id: "output-1" }],
    });
    getReferencesMock.mockResolvedValue([
      { id: "ref-1", assetKey: "assets/ana-1.png" },
      { id: "ref-2", assetKey: "assets/ana-2.png" },
    ]);
  });

  it("returns primary and secondary photo urls for the frozen snapshot people", async () => {
    const res = await GET(new Request("http://localhost/person-references"), { params: params() });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      people: [{
        personId: snapshotPerson.personId,
        name: "Ana",
        primaryPhotoUrl: "https://cdn.test/assets/ana-1.png",
        photoUrls: ["https://cdn.test/assets/ana-1.png", "https://cdn.test/assets/ana-2.png"],
      }],
    });
    expect(getReferencesMock).toHaveBeenCalledWith("workspace-1", "profile-1");
  });

  it("returns empty urls without people and 404s unknown outputs", async () => {
    getWorkMock.mockResolvedValue({
      work: { id: "work-1", clientProfileId: "profile-1", inputSnapshot: {} },
      outputs: [{ id: "output-1" }],
    });
    const empty = await GET(new Request("http://localhost/person-references"), { params: params() });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ people: [] });

    getWorkMock.mockResolvedValue({
      work: { id: "work-1", clientProfileId: "profile-1", inputSnapshot: {} },
      outputs: [{ id: "output-1" }],
    });
    const missing = await GET(new Request("http://localhost/person-references"), { params: params("work-1", "output-9") });
    expect(missing.status).toBe(404);
  });
});
