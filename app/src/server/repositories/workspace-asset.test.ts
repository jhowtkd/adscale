import { beforeEach, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const { select, where } = vi.hoisted(() => {
  const where = vi.fn();
  return { where, select: vi.fn(() => ({ from: () => ({ where }) })) };
});
vi.mock("../db", () => ({ db: { select } }));

import { getWorkspaceAssetsByKeys } from "./workspace-asset";

beforeEach(() => vi.clearAllMocks());

it.each([
  ["workspace-1", 1],
  ["workspace-2", 100],
])("reads %s with %i keys in one tenant-scoped query", async (workspaceId, count) => {
  const keys = Array.from({ length: count }, (_, index) => `key-${index}`);
  where.mockResolvedValue([{ id: "asset-1", key: keys[0], workspaceId }]);

  expect(await getWorkspaceAssetsByKeys(workspaceId, keys)).toEqual([
    { id: "asset-1", key: keys[0], workspaceId },
  ]);
  expect(select).toHaveBeenCalledTimes(1);
  const query = new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL);
  expect(query.sql).toContain('"workspace_assets"."workspace_id"');
  expect(query.params).toEqual([workspaceId, ...keys]);
});

it("skips the database for an empty key list", async () => {
  expect(await getWorkspaceAssetsByKeys("workspace-1", [])).toEqual([]);
  expect(select).not.toHaveBeenCalled();
});
