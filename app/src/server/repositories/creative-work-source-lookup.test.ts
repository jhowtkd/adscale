import { beforeEach, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const { select, where } = vi.hoisted(() => {
  const where = vi.fn();
  return { where, select: vi.fn(() => ({ from: () => ({ where }) })) };
});
vi.mock("../db", () => ({ db: { select } }));

import { getWorkspaceAssetsByIds } from "./workspace-asset";
import { getTemplatesByIds } from "./template";

beforeEach(() => vi.clearAllMocks());

it.each([
  ["workspace_assets", getWorkspaceAssetsByIds],
  ["campaign_templates", getTemplatesByIds],
] as const)("reads %s IDs in one workspace-scoped query", async (table, lookup) => {
  where.mockResolvedValue([{ id: "id-1", workspaceId: "workspace-1" }]);

  expect(await lookup("workspace-1", ["id-1", "id-2", "id-1"])).toEqual([
    { id: "id-1", workspaceId: "workspace-1" },
  ]);
  expect(select).toHaveBeenCalledTimes(1);
  const query = new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL);
  expect(query.sql).toContain(`"${table}"."workspace_id"`);
  expect(query.params).toEqual(["workspace-1", "id-1", "id-2"]);
});

it("skips both queries for an empty source list", async () => {
  expect(await getWorkspaceAssetsByIds("workspace-1", [])).toEqual([]);
  expect(await getTemplatesByIds("workspace-1", [])).toEqual([]);
  expect(select).not.toHaveBeenCalled();
});
