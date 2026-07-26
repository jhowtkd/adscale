import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const { whereMock, fromMock, selectMock, updateMock, setMock, updateWhereMock, returningMock } = vi.hoisted(() => {
  const whereMock = vi.fn();
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const returningMock = vi.fn();
  const updateWhereMock = vi.fn(() => ({ returning: returningMock }));
  const setMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));
  return { whereMock, fromMock, selectMock, updateMock, setMock, updateWhereMock, returningMock };
});

vi.mock("../db", () => ({
  db: {
    select: selectMock,
    update: updateMock,
  },
}));

import {
  failQueuedDerivation,
  getActivePackageChildren,
  touchQueuedDerivation,
  updateDerivationDualVerdict,
  updateDerivationPromptProvenance,
  updateDerivationQa,
} from "./derivation";
import { FACTUAL_SOURCE_RULES } from "../ai/creative-contract";
import type {
  ExportStatusPayload,
  OlharVerdictPayload,
} from "../ai/olhar/dual-verdict";

describe("derivation repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereMock.mockResolvedValue([]);
  });

  describe("failQueuedDerivation", () => {
    it("claims only the queued row in the requested workspace", async () => {
      returningMock.mockResolvedValue([{ id: "derivation-id", status: "failed" }]);

      await failQueuedDerivation("derivation-id", "workspace-id");

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", updatedAt: expect.any(Date) }),
      );
      const condition = updateWhereMock.mock.calls[0]?.[0] as SQL;
      const query = new PgDialect().sqlToQuery(condition);
      expect(query.params).toEqual([
        "derivation-id",
        "workspace-id",
        "queued",
      ]);
    });
  });

  describe("touchQueuedDerivation", () => {
    it("advances the dispatch acknowledgement beyond the reservation timestamp", async () => {
      const reservedAt = new Date(Date.now() + 1_000);
      returningMock.mockResolvedValue([{ id: "derivation-id" }]);

      await touchQueuedDerivation(
        "derivation-id",
        "workspace-id",
        reservedAt,
      );

      expect(setMock).toHaveBeenCalledWith({
        updatedAt: new Date(reservedAt.getTime() + 1),
      });
    });
  });

  describe("delivery package derivation helpers", () => {
    it("returns active package children for a parent and target formats", async () => {
      const rows = [
        { id: "child-4:5", parentId: "source-id", format: "4:5", status: "queued" },
      ];
      whereMock.mockResolvedValue(rows);

      const result = await getActivePackageChildren({
        parentId: "source-id",
        workspaceId: "workspace-id",
        formats: ["4:5", "9:16"],
      });

      expect(selectMock).toHaveBeenCalledTimes(1);
      expect(fromMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(rows);
    });

    it("does not query when formats array is empty", async () => {
      const result = await getActivePackageChildren({
        parentId: "source-id",
        workspaceId: "workspace-id",
        formats: [],
      });

      expect(result).toEqual([]);
      expect(selectMock).not.toHaveBeenCalled();
    });
  });

  describe("updateDerivationPromptProvenance", () => {
    const creativeContract = {
      generationMode: "art_variation" as const,
      targetFormat: "1:1",
      ctaSemantics: { kind: "inherited" as const },
      baseAssetId: "asset-1",
      styleAssetId: null,
      client: "Acme",
      product: "Widget",
      offer: null,
      constraints: null,
      sourcePackage: "campaign_asset" as const,
      factualSourceRules: FACTUAL_SOURCE_RULES,
    };

    const promptProvenance = {
      schemaVersion: 1 as const,
      inputPrompt: "built prompt",
      model: "gpt-image-1",
      requestedSize: "1024x1024",
      sourcePackage: "campaign_asset" as const,
      source: {
        kind: "campaign_asset" as const,
        assetId: "asset-1",
        assetKey: "assets/base.png",
      },
      generationMode: "art_variation" as const,
      targetFormat: "1:1",
    };

    it("sets creativeContract, promptProvenance, and updatedAt", async () => {
      const row = {
        id: "derivation-id",
        creativeContract,
        promptProvenance,
        inputPrompt: "built prompt",
      };
      returningMock.mockResolvedValue([row]);

      const result = await updateDerivationPromptProvenance(
        "derivation-id",
        "workspace-id",
        {
          creativeContract,
          promptProvenance,
          inputPrompt: "built prompt",
        }
      );

      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          creativeContract,
          promptProvenance,
          inputPrompt: "built prompt",
          updatedAt: expect.any(Date),
        })
      );
      expect(result).toBe(row);
    });

    it("scopes update by id and workspaceId", async () => {
      returningMock.mockResolvedValue([{ id: "derivation-id" }]);

      await updateDerivationPromptProvenance("derivation-id", "workspace-id", {
        creativeContract,
        promptProvenance,
      });

      expect(updateWhereMock).toHaveBeenCalledTimes(1);
    });

    it("returns null when no row matches", async () => {
      returningMock.mockResolvedValue([]);

      const result = await updateDerivationPromptProvenance("missing-id", "workspace-id", {
        creativeContract,
        promptProvenance,
      });

      expect(result).toBeNull();
    });
  });

  describe("updateDerivationDualVerdict", () => {
    const olharVerdict: OlharVerdictPayload = {
      value: "quase",
      axes: { figura: 2, gestalt: 2, voz: 1, convite: 1 },
      whatWorks: ["Clear figure"],
      whatBlocks: ["Weak invite"],
      directionNote: "Strengthen the invitation before export.",
      source: "quality_gate",
      evaluatedAt: "2026-06-19T12:00:00.000Z",
    };

    const exportStatus: ExportStatusPayload = {
      value: "ajuste_menor",
      issues: [{ code: "cta_drift", message: "CTA wording shifted slightly" }],
      setupIssues: [],
      evaluatedAt: "2026-06-19T12:00:00.000Z",
    };

    it("writes both dual verdict payloads and updates updatedAt", async () => {
      const row = {
        id: "derivation-id",
        olharVerdict,
        exportStatus,
      };
      returningMock.mockResolvedValue([row]);

      const result = await updateDerivationDualVerdict(
        "derivation-id",
        "workspace-id",
        { olharVerdict, exportStatus }
      );

      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          olharVerdict,
          exportStatus,
          updatedAt: expect.any(Date),
        })
      );
      expect(updateWhereMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(row);
    });

    it("returns null when no row matches", async () => {
      returningMock.mockResolvedValue([]);

      const result = await updateDerivationDualVerdict("missing-id", "workspace-id", {
        olharVerdict,
      });

      expect(result).toBeNull();
    });
  });

  describe("updateDerivationQa", () => {
    it("updates QA fields scoped by id and workspace", async () => {
      const row = { id: "derivation-id", qaStatus: "warning" };
      returningMock.mockResolvedValue([row]);

      const result = await updateDerivationQa("derivation-id", "workspace-id", {
        qaStatus: "warning",
        qaChecklist: { legibility: { status: "passed", note: "OK" } },
        qaIssues: ["Issue 1"],
        qaSuggestions: ["Suggestion 1"],
      });

      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledTimes(1);
      expect(updateWhereMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(row);
    });

    it("returns null when no row matches", async () => {
      returningMock.mockResolvedValue([]);

      const result = await updateDerivationQa("missing-id", "workspace-id", {
        qaStatus: "ready",
        qaChecklist: {},
        qaIssues: [],
        qaSuggestions: [],
      });

      expect(result).toBeNull();
    });
  });

  describe("updateDerivationDualVerdict", () => {
    const olharVerdict = {
      value: "quase" as const,
      axes: { figura: 2, gestalt: 2, voz: 2, convite: 2 },
      whatWorks: [],
      whatBlocks: [],
      directionNote: "Nearly ready.",
      source: "quality_gate" as const,
      evaluatedAt: "2026-06-19T12:00:00.000Z",
    };
    const exportStatus = {
      value: "ok" as const,
      issues: [],
      setupIssues: [],
      evaluatedAt: "2026-06-19T12:00:00.000Z",
    };

    it("writes both dual verdict payloads and updates updatedAt", async () => {
      const row = {
        id: "derivation-id",
        olharVerdict,
        exportStatus,
        updatedAt: new Date("2026-06-19T12:00:00.000Z"),
      };
      returningMock.mockResolvedValue([row]);

      const result = await updateDerivationDualVerdict("derivation-id", "workspace-id", {
        olharVerdict,
        exportStatus,
      });

      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          olharVerdict,
          exportStatus,
          updatedAt: expect.any(Date),
        })
      );
      expect(result).toBe(row);
    });
  });
});
