import { beforeEach, describe, expect, it, vi } from "vitest";

const getWork = vi.hoisted(() => vi.fn());
const buildOptions = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/creative-work", () => ({ getCreativeWork: getWork }));
vi.mock("@/server/creative-work/identity", () => ({ buildIdentityOptions: buildOptions }));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(async () => ({ user: { id: "user-1" }, workspace: { id: "ws-1" } })),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));

import { GET } from "./route";

const request = () => new Request("http://localhost/api/creative-work/work-1/identity-options");
const params = () => Promise.resolve({ id: "work-1" });

const preparedBrief = {
  theme: "Grupo de terapia",
  objective: "Promover Grupo de terapia",
  // R-002: the prepare step persists an empty audience by design — unknown
  // targeting never receives a placeholder.
  audience: "",
  offer: "Inscrições abertas",
};

describe("GET /api/creative-work/[id]/identity-options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildOptions.mockResolvedValue([{ referenceId: "ref-1", reason: "Mais alinhada" }]);
  });

  it("serves a work prepared with an empty audience (schema defines validity)", async () => {
    getWork.mockResolvedValue({
      work: {
        id: "work-1",
        clientProfileId: "profile-1",
        brief: preparedBrief,
        format: "4:5",
      },
      outputs: [],
      sources: [],
    });

    const response = await GET(request(), { params: params() });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(buildOptions).toHaveBeenCalledWith(
      "ws-1",
      "profile-1",
      preparedBrief,
      "4:5",
    );
    expect(body.options).toHaveLength(1);
  });

  it("returns 404 when the work does not belong to the workspace", async () => {
    getWork.mockResolvedValue(null);

    const response = await GET(request(), { params: params() });

    expect(response.status).toBe(404);
    expect(buildOptions).not.toHaveBeenCalled();
  });

  it.each([
    ["missing brief", null],
    ["empty theme", { ...preparedBrief, theme: " " }],
    ["empty objective", { ...preparedBrief, objective: "" }],
    ["empty offer", { ...preparedBrief, offer: "  " }],
  ])("returns 409 when the work is not prepared (%s)", async (_case, brief) => {
    getWork.mockResolvedValue({
      work: { id: "work-1", clientProfileId: "profile-1", brief },
      outputs: [],
      sources: [],
    });

    const response = await GET(request(), { params: params() });

    expect(response.status).toBe(409);
    expect(buildOptions).not.toHaveBeenCalled();
  });
});
