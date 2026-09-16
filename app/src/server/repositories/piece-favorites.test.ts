import { expect, it, vi } from "vitest";
import { addPieceFavorite, listPieceFavorites } from "./piece-favorites";
import { pieceFavorites } from "@/server/db/schema";

const mocks = vi.hoisted(() => ({ returning: vi.fn(), conflict: vi.fn(), limit: vi.fn(), orderBy: vi.fn() }));
vi.mock("@/server/db", () => ({ db: {
  insert: () => ({ values: () => ({ onConflictDoNothing: mocks.conflict }) }),
  select: () => ({ from: () => ({
    where: () => ({ limit: mocks.limit }),
    innerJoin: () => ({ innerJoin: () => ({ where: () => ({ orderBy: mocks.orderBy }) }) }),
  }) }),
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

it("lists the user's favorites with a download link per piece", async () => {
  const createdAt = new Date("2026-09-10T12:00:00.000Z");
  mocks.orderBy.mockResolvedValue([
    { id: "favorite", outputId: "output", workItemId: "work", name: "Peça", createdAt },
  ]);
  await expect(listPieceFavorites({ workspaceId: "workspace", userId: "user" })).resolves.toEqual([
    {
      id: "favorite",
      outputId: "output",
      workItemId: "work",
      name: "Peça",
      createdAt,
      downloadHref: "/api/creative-work/work/outputs/output/download",
    },
  ]);
});
