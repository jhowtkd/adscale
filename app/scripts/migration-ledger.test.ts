import { describe, expect, it, vi } from "vitest";
import { ensureMigrationLedger } from "./migration-ledger.mjs";

describe("migration ledger bootstrap", () => {
  it("creates the Drizzle ledger before a clean database is inspected", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await ensureMigrationLedger({ query });

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]![0]).toMatch(/create table if not exists public\."__drizzle_migrations"/i);
  });
});
