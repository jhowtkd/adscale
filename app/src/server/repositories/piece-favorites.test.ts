import { expect, it, vi } from "vitest";
import { addPieceFavorite } from "./piece-favorites";
import { pieceFavorites } from "@/server/db/schema";

const mocks = vi.hoisted(() => ({ returning: vi.fn(), conflict: vi.fn(), limit: vi.fn() }));
vi.mock("@/server/db", () => ({ db: {
  insert: () => ({ values: () => ({ onConflictDoNothing: mocks.conflict }) }),
  select: () => ({ from: () => ({ where: () => ({ limit: mocks.limit }) }) }),
} }));

it("uses the unique user/output constraint to make competing additions idempotent", async () => {
  mocks.conflict.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValueOnce([{ id: "favorite" }]).mockResolvedValueOnce([]);
  mocks.limit.mockResolvedValue([{ id: "favorite" }]);
  const input = { workspaceId: "workspace", userId: "user", outputId: "output" };
  expect(await Promise.all([addPieceFavorite(input), addPieceFavorite(input)])).toEqual([
    { id: "favorite", created: true }, { id: "favorite", created: false },
  ]);
  expect(mocks.conflict).toHaveBeenCalledWith({ target: [pieceFavorites.userId, pieceFavorites.outputId] });
});
