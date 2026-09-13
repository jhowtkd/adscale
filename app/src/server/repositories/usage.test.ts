import { beforeEach, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
const { select, where } = vi.hoisted(() => {
  const where = vi.fn();
  return { where, select: vi.fn(() => ({ from: () => ({ where }) })) };
});
vi.mock("../db", () => ({ db: { select } }));
import { getUsageByIdempotencyKeys } from "./usage";
beforeEach(() => vi.clearAllMocks());
it.each([3, 30])("reads %i keys in one workspace-scoped SQL query", async (count) => {
  const keys = Array.from({ length: count }, (_, i) => `key-${i}`);
  where.mockResolvedValue([{ id: "usage-1", idempotencyKey: keys[0] }]);
  const result = await getUsageByIdempotencyKeys("workspace-1", keys);
  expect(result.get(keys[0])?.id).toBe("usage-1");
  expect(result.has("missing")).toBe(false);
  expect(select).toHaveBeenCalledTimes(1);
  const query = new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL);
  expect(query.sql).toContain('"usage_events"."workspace_id"');
  expect(query.params).toEqual(["workspace-1", ...keys]);
});
it("does not query an empty batch", async () => {
  expect((await getUsageByIdempotencyKeys("workspace-1", [])).size).toBe(0);
  expect(select).not.toHaveBeenCalled();
});
