import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { FrozenSinglePieceGuidance } from "../brand-taste/single-piece-guidance";

const state = vi.hoisted(() => ({
  work: { toolKind: "single", clientProfileId: "brand", updatedAt: new Date("2026-10-13T12:00:00Z"), preparedGuidance: null as FrozenSinglePieceGuidance | null },
  execution: { frozenGuidance: null as FrozenSinglePieceGuidance | null, targetFormat: "4:5", parentOutputId: null, kind: "creative_prepare", id: "attempt", inputFingerprint: "fingerprint", inputRevision: "2026-10-13T12:00:00.000Z" },
  missing: false,
}));
const resolve = vi.hoisted(() => vi.fn());
const execute = vi.hoisted(() => vi.fn<(query: SQL) => Promise<void>>(async () => {}));
vi.mock("../brand-taste/single-piece-guidance", () => ({ resolveSinglePieceGuidance: resolve }));
vi.mock("../db", async () => {
  const { getTableName } = await import("drizzle-orm");
  const tx = {
    execute,
    select: () => ({ from: (table: Parameters<typeof getTableName>[0]) => ({ where: () => {
      const rows = () => state.missing ? [] : [getTableName(table) === "creative_work_items" ? state.work : state.execution];
      return { for: async () => rows(), limit: async () => rows() };
    } }) }),
    update: (table: Parameters<typeof getTableName>[0]) => ({ set: (values: { frozenGuidance?: FrozenSinglePieceGuidance; preparedGuidance?: FrozenSinglePieceGuidance }) => ({ where: async () => {
      if (getTableName(table) === "creative_work_items") state.work.preparedGuidance = values.preparedGuidance!;
      else state.execution.frozenGuidance = values.frozenGuidance!;
    } }) }),
  };
  return { db: { ...tx, transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx) } };
});
import { freezeSinglePieceOutputGuidance, freezeSinglePiecePreparationGuidance } from "./single-piece-guidance";

const empty = { lines: [], appliedRefs: [], setHash: null, omissions: [] };
const selection: FrozenSinglePieceGuidance = {
  version: 1, generationMode: "single", format: "4:5", fixedPromptVersion: "fixed/v1",
  roles: { copy: { ...empty, lines: ["Orientação original"], appliedRefs: [{ ruleId: "original", revision: "legacy", contentHash: "a".repeat(64) }] }, art_direction: empty, image_prompt: empty },
};
const scope = { workspaceId: "workspace", workItemId: "work" };
const freezes = [
  ["preparation", () => freezeSinglePiecePreparationGuidance({ ...scope, attemptId: "attempt", format: "4:5" })],
  ["output", () => freezeSinglePieceOutputGuidance({ ...scope, outputId: "output" })],
] as const;

beforeEach(() => {
  state.execution.frozenGuidance = null;
  state.work.preparedGuidance = null;
  state.work.updatedAt = new Date("2026-10-13T12:00:00Z");
  state.execution.inputRevision = state.work.updatedAt.toISOString();
  state.execution.id = "attempt";
  state.execution.inputFingerprint = "fingerprint";
  state.work.toolKind = "single";
  state.missing = false;
  resolve.mockReset();
  execute.mockClear();
});
describe("Single-piece durable freeze without a database", () => {
  it("reuses the durable execution after an identical autosave changes the CAS token", async () => {
    resolve.mockResolvedValueOnce(selection).mockResolvedValue({ ...selection, roles: { copy: empty, art_direction: empty, image_prompt: empty } });
    const frozen = await freezeSinglePiecePreparationGuidance({ ...scope, attemptId: "attempt", format: "4:5" });
    expect(frozen).toEqual({ ...selection, preparation: { executionId: "attempt", inputFingerprint: "fingerprint" } });
    expect(state.work.preparedGuidance).toEqual(frozen);
    state.work.updatedAt = new Date("2026-10-13T12:00:01Z");
    state.execution.inputRevision = state.work.updatedAt.toISOString();
    state.execution.id = "retry-attempt";
    state.execution.frozenGuidance = null;
    expect(await freezeSinglePiecePreparationGuidance({ ...scope, attemptId: "retry-attempt", format: "4:5" })).toEqual(frozen);
    expect(state.execution.frozenGuidance).toEqual(frozen);
    expect(resolve).toHaveBeenCalledOnce();
    const locks = execute.mock.calls.map(([query]) => new PgDialect().sqlToQuery(query));
    expect(locks.map(query => query.params)).toEqual([["workspace:work:prepare"], ["workspace:work:prepare"]]);
    for (const query of locks) expect(query.sql).toContain("pg_advisory_xact_lock");
  });
  it("refuses a stale preparation before overwriting the durable reference", async () => {
    state.execution.inputRevision = "2026-10-13T11:59:59.000Z";
    await expect(freezeSinglePiecePreparationGuidance({ ...scope, attemptId: "attempt", format: "4:5" }))
      .rejects.toThrow("stale_single_piece_guidance_preparation");
    expect(state.work.preparedGuidance).toBeNull();
    expect(state.execution.frozenGuidance).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });
  it.each(freezes)("%s persists once and resumes the original selection after live guidance changes", async (_kind, freeze) => {
    resolve.mockResolvedValueOnce(selection).mockResolvedValue({ ...selection, roles: { copy: empty, art_direction: empty, image_prompt: empty } });
    const expected = _kind === "preparation" ? { ...selection, preparation: { executionId: "attempt", inputFingerprint: "fingerprint" } } : selection;
    expect(await freeze()).toEqual(expected);
    expect(state.execution.frozenGuidance).toEqual(expected);
    expect(await freeze()).toEqual(expected);
    expect(resolve).toHaveBeenCalledOnce();
  });
  it.each(freezes)("%s refuses a missing execution", async (_kind, freeze) => {
    state.missing = true;
    await expect(freeze()).rejects.toThrow();
    expect(resolve).not.toHaveBeenCalled();
  });
  it.each(freezes)("%s leaves other protocols untouched", async (_kind, freeze) => {
    state.work.toolKind = "variations";
    expect(await freeze()).toBeNull();
    expect(state.execution.frozenGuidance).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });
});
