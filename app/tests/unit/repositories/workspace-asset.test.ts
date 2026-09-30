import { describe, it, expect, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "@/server/db";
import {
  createWorkspaceAsset,
  getAssetIdsVisibleToBrand,
  getWorkspaceAssets,
  getWorkspaceAssetById,
  getWorkspaceAssetByKey,
  updateWorkspaceAsset,
  deleteWorkspaceAsset,
  isWorkspaceAssetKey,
} from "@/server/repositories/workspace-asset";

const dialect = new PgDialect();
function serializedCondition(condition: unknown) {
  return dialect.sqlToQuery(condition as SQL);
}

describe("workspace-asset repository", () => {
  const workspaceId = "ws-123";

  it("createWorkspaceAsset inserts with workspaceId", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const result = await createWorkspaceAsset({
      workspaceId,
      name: "logo.png",
      key: "workspaces/ws-123/assets/logo.png",
      type: "image/png",
      size: 1024,
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId, name: "logo.png", source: "upload" })
    );
    expect(result).toEqual({ id: "wa-1" });
  });

  it("getWorkspaceAssets filters by workspaceId", async () => {
    const mockOffset = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await getWorkspaceAssets(workspaceId);

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual([{ id: "wa-1" }]);
  });

  it("getWorkspaceAssetById filters by id and workspaceId", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await getWorkspaceAssetById("wa-1", workspaceId);

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual({ id: "wa-1" });
  });

  it("updateWorkspaceAsset updates fields and updatedAt", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: vi.fn().mockReturnValue({ where: mockWhere }) });

    const result = await updateWorkspaceAsset("wa-1", workspaceId, {
      name: "new-name.png",
      tags: ["logo", "brand"],
    });

    expect(result).toEqual({ id: "wa-1" });
  });

  it("deleteWorkspaceAsset filters by id and workspaceId", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where: mockWhere });

    const result = await deleteWorkspaceAsset("wa-1", workspaceId);

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual({ id: "wa-1" });
  });

  it("isWorkspaceAssetKey returns true when key exists", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await isWorkspaceAssetKey(workspaceId, "key-123");

    expect(result).toBe(true);
  });

  it("createWorkspaceAsset persists metadata when provided", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "wa-2" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const metadata = { hasAlpha: true, originalMimeType: "image/svg+xml" };

    await createWorkspaceAsset({
      workspaceId,
      name: "mark.svg",
      key: "workspaces/ws-123/brand-training/abc-mark.png",
      type: "image/png",
      size: 4096,
      source: "brand_training",
      metadata,
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId, metadata }),
    );
  });

  it("createWorkspaceAsset omits metadata when not provided", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "wa-3" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await createWorkspaceAsset({
      workspaceId,
      name: "logo.png",
      key: "workspaces/ws-123/assets/logo.png",
      type: "image/png",
      size: 1024,
    });

    const inserted = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted).not.toHaveProperty("metadata");
  });

  it("getWorkspaceAssetByKey filters by workspaceId and key", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await getWorkspaceAssetByKey(
      workspaceId,
      "workspaces/ws-123/brand-training/abc-logo.png",
    );

    expect(mockWhere).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual({ id: "wa-1" });
  });

  it("getWorkspaceAssetByKey returns null when no row matches", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await getWorkspaceAssetByKey(
      workspaceId,
      "workspaces/ws-123/brand-training/missing.png",
    );

    expect(result).toBeNull();
  });

  describe("ticket 07: brand scope, origin and filters", () => {
    it("createWorkspaceAsset persists clientProfileId when provided", async () => {
      const mockReturning = vi.fn().mockResolvedValue([{ id: "wa-4" }]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

      await createWorkspaceAsset({
        workspaceId,
        clientProfileId: "brand-1",
        name: "site-photo.jpg",
        key: "workspaces/ws-123/assets/site-photo.jpg",
        type: "image/jpeg",
        size: 2048,
        source: "brand_site",
        metadata: { originUrl: "https://acme.com/team.jpg" },
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId, clientProfileId: "brand-1", source: "brand_site" }),
      );
    });

    it("createWorkspaceAsset defaults clientProfileId to null when omitted", async () => {
      const mockReturning = vi.fn().mockResolvedValue([{ id: "wa-5" }]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

      await createWorkspaceAsset({
        workspaceId,
        name: "logo.png",
        key: "workspaces/ws-123/assets/logo2.png",
        type: "image/png",
        size: 1024,
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ clientProfileId: null }),
      );
    });

    it("getWorkspaceAssets filters by clientProfileId when provided", async () => {
      const mockOffset = vi.fn().mockResolvedValue([]);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

      await getWorkspaceAssets(workspaceId, { clientProfileId: "brand-1" });

      const condition = mockWhere.mock.calls[0]?.[0];
      const { sql } = serializedCondition(condition);
      expect(sql).toContain("client_profile_id");
    });

    it("getWorkspaceAssets(clientProfileId) also matches shared/ambiguous assets (NULL brand), never re-including provisional ones", async () => {
      const mockOffset = vi.fn().mockResolvedValue([]);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

      await getWorkspaceAssets(workspaceId, { clientProfileId: "brand-1" });

      const condition = mockWhere.mock.calls[0]?.[0];
      const { sql, params } = serializedCondition(condition);
      // A backfill that couldn't resolve a single brand (conflict/ambiguous)
      // leaves client_profile_id NULL; those rows must still surface for
      // every brand in the workspace, not just disappear from the Library.
      expect(sql.toLowerCase()).toContain("is null");
      expect(params).toContain("brand-1");
      // The provisional exclusion still applies regardless of the OR branch.
      expect(sql).toContain("provisional");
    });

    it("getWorkspaceAssets excludes provisional assets even without an explicit filter", async () => {
      const mockOffset = vi.fn().mockResolvedValue([]);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

      await getWorkspaceAssets(workspaceId);

      const condition = mockWhere.mock.calls[0]?.[0];
      const { sql } = serializedCondition(condition);
      expect(sql).toContain("provisional");
    });

    it("getWorkspaceAssets(source brand_upload) also matches legacy uploads stored with the default 'upload' source", async () => {
      const mockOffset = vi.fn().mockResolvedValue([]);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

      await getWorkspaceAssets(workspaceId, { source: "brand_upload" });

      const { sql, params } = serializedCondition(mockWhere.mock.calls[0]?.[0]);
      // Uploads made before the brand-scoped Library keep source "upload": "Enviado por você" must not hide them.
      expect(sql).toMatch(/"source" in \(/i);
      expect(params).toEqual(expect.arrayContaining(["brand_upload", "upload"]));
    });

    it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"])("getWorkspaceAssets(source %s) is a plain equality on that text, never an alias lookup on Object.prototype", async (source) => {
      const mockOffset = vi.fn().mockResolvedValue([]);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

      await getWorkspaceAssets(workspaceId, { source });

      const { sql, params } = serializedCondition(mockWhere.mock.calls[0]?.[0]);
      expect(params).toContain(source);
      expect(sql).not.toMatch(/"source" in \(/i);
    });

    it("getAssetIdsVisibleToBrand fails closed without a brand: no ids, and no query at all", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockClear();

      await expect(getAssetIdsVisibleToBrand(workspaceId, "", ["asset-1", "asset-2"])).resolves.toEqual([]);

      // With no brand the shared visibility rule would widen to the whole workspace.
      expect(db.select).not.toHaveBeenCalled();
    });

    it("getWorkspaceAssets(source brand_site) stays an exact match, never widened to legacy uploads", async () => {
      const mockOffset = vi.fn().mockResolvedValue([]);
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

      await getWorkspaceAssets(workspaceId, { source: "brand_site" });

      const { sql, params } = serializedCondition(mockWhere.mock.calls[0]?.[0]);
      expect(params).toContain("brand_site");
      expect(params).not.toContain("upload");
      expect(sql).not.toMatch(/"source" in \(/i);
    });

    it("updateWorkspaceAsset merges metadata instead of replacing it, so caption/originUrl survive a later analysis write", async () => {
      const mockReturning = vi.fn().mockResolvedValue([{ id: "wa-1" }]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

      await updateWorkspaceAsset("wa-1", workspaceId, {
        metadata: { category: "product", dominantColors: ["#fff"] },
      });

      const setArg = mockSet.mock.calls[0]?.[0] as Record<string, unknown>;
      const { sql } = serializedCondition(setArg.metadata);
      // A merge (coalesce(...) || ...), never a bare replacement of the column.
      expect(sql).toContain("coalesce");
      expect(sql).toMatch(/\|\|/);
    });
  });
});
