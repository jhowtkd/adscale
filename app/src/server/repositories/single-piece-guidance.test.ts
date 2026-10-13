import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { FrozenSinglePieceGuidance } from "../brand-taste/single-piece-guidance";

const state = vi.hoisted(() => ({
  work: { toolKind: "single", clientProfileId: "brand" },
  execution: { frozenGuidance: null as FrozenSinglePieceGuidance | null, targetFormat: "4:5", parentOutputId: null, kind: "creative_prepare", inputRevision: "revision-1" },
  history: [] as Array<{ frozenGuidance: FrozenSinglePieceGuidance }>,
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
      return { for: async () => rows(), limit: async () => rows(), orderBy: () => ({ limit: async () => state.history }) };
    } }) }),
    update: () => ({ set: (values: { frozenGuidance: FrozenSinglePieceGuidance }) => ({ where: async () => {
      state.execution.frozenGuidance = values.frozenGuidance;
      state.history.push({ frozenGuidance: values.frozenGuidance });
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
  state.history = [];
  state.work.toolKind = "single";
  state.missing = false;
  resolve.mockReset();
  execute.mockClear();
});
describe("Single-piece durable freeze without a database", () => {
  it("reuses the execution snapshot across different technical attempt IDs", async () => {
    resolve.mockResolvedValueOnce(selection).mockResolvedValue({ ...selection, roles: { copy: empty, art_direction: empty, image_prompt: empty } });
    expect(await freezeSinglePiecePreparationGuidance({ ...scope, attemptId: "failed-attempt", format: "4:5" })).toEqual(selection);
    state.execution.frozenGuidance = null;
    expect(await freezeSinglePiecePreparationGuidance({ ...scope, attemptId: "retry-attempt", format: "4:5" })).toEqual(selection);
    expect(state.execution.frozenGuidance).toEqual(selection);
    expect(resolve).toHaveBeenCalledOnce();
    const locks = execute.mock.calls.map(([query]) => new PgDialect().sqlToQuery(query));
    expect(locks.map(query => query.params)).toEqual([
      ["single-piece-guidance:workspace:work:creative_prepare:revision-1"],
      ["single-piece-guidance:workspace:work:creative_prepare:revision-1"],
    ]);
    for (const query of locks) expect(query.sql).toContain("pg_advisory_xact_lock");
  });
  it.each(freezes)("%s persists once and resumes the original selection after live guidance changes", async (_kind, freeze) => {
    resolve.mockResolvedValueOnce(selection).mockResolvedValue({ ...selection, roles: { copy: empty, art_direction: empty, image_prompt: empty } });
    expect(await freeze()).toEqual(selection);
    expect(state.execution.frozenGuidance).toEqual(selection);
    expect(await freeze()).toEqual(selection);
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
