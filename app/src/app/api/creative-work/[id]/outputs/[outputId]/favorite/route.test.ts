import { describe, expect, it, vi, beforeEach } from "vitest";
import { DELETE, GET, PUT } from "./route";

const accessMock = vi.hoisted(() => vi.fn());
const getOutputMock = vi.hoisted(() => vi.fn());
const isFavoriteMock = vi.hoisted(() => vi.fn());
const addFavoriteMock = vi.hoisted(() => vi.fn());
const removeFavoriteMock = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: (...args: unknown[]) => accessMock(...args),
}));

vi.mock("@/server/repositories/piece-favorites", () => ({
  getCreativeWorkOutputForFavorite: (...args: unknown[]) => getOutputMock(...args),
  isPieceFavorited: (...args: unknown[]) => isFavoriteMock(...args),
  addPieceFavorite: (...args: unknown[]) => addFavoriteMock(...args),
  removePieceFavorite: (...args: unknown[]) => removeFavoriteMock(...args),
}));

function params(id = "work-1", outputId = "output-1") {
  return Promise.resolve({ id, outputId });
}

describe("piece favorite API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    });
    getOutputMock.mockResolvedValue({
      id: "output-1",
      workspaceId: "workspace-1",
      workItemId: "work-1",
      status: "completed",
      outputKey: "out.png",
    });
  });

  it("returns the current favorite state", async () => {
    isFavoriteMock.mockResolvedValue(true);
    const res = await GET(new Request("http://localhost/favorite"), { params: params() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ favorite: true });
    expect(getOutputMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
  });

  it("favorites a completed output for the signed-in user", async () => {
    addFavoriteMock.mockResolvedValue({ id: "fav-1", created: true });
    const res = await PUT(new Request("http://localhost/favorite", { method: "PUT" }), { params: params() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ favorite: true, id: "fav-1" });
    expect(addFavoriteMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "user-1",
      outputId: "output-1",
    });
  });

  it("removes a favorite without changing approval", async () => {
    removeFavoriteMock.mockResolvedValue(true);
    const res = await DELETE(new Request("http://localhost/favorite", { method: "DELETE" }), { params: params() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ favorite: false });
    expect(removeFavoriteMock).toHaveBeenCalledWith({ userId: "user-1", outputId: "output-1" });
  });

  it("does not favorite an output from another workspace", async () => {
    getOutputMock.mockResolvedValue(null);
    const res = await PUT(new Request("http://localhost/favorite", { method: "PUT" }), { params: params() });
    expect(res.status).toBe(404);
    expect(addFavoriteMock).not.toHaveBeenCalled();
  });

  it("does not favorite an output that is not ready", async () => {
    getOutputMock.mockResolvedValue({
      id: "output-1",
      workspaceId: "workspace-1",
      workItemId: "work-1",
      status: "processing",
      outputKey: null,
    });
    const res = await PUT(new Request("http://localhost/favorite", { method: "PUT" }), { params: params() });
    expect(res.status).toBe(409);
    expect(addFavoriteMock).not.toHaveBeenCalled();
  });
});
