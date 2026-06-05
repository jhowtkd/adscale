import { beforeEach, describe, expect, it, vi } from "vitest";

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
  getActivePackageChildren,
  updateDerivationPromptProvenance,
  updateDerivationQa,
} from "./derivation";
import { FACTUAL_SOURCE_RULES } from "../ai/creative-contract";

describe("derivation repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereMock.mockResolvedValue([]);
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
});
