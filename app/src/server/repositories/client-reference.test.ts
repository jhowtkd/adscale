import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  whereMock,
  orderByMock,
  fromMock,
  selectMock,
  insertMock,
  valuesMock,
  returningMock,
  updateMock,
  setMock,
} = vi.hoisted(() => {
  const whereMock = vi.fn();
  const orderByMock = vi.fn();
  const fromMock = vi.fn(() => ({ where: whereMock, orderBy: orderByMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const returningMock = vi.fn();
  const valuesMock = vi.fn(() => ({ returning: returningMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const setMock = vi.fn(() => ({ where: whereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));
  return {
    whereMock,
    orderByMock,
    fromMock,
    selectMock,
    insertMock,
    valuesMock,
    returningMock,
    updateMock,
    setMock,
  };
});

vi.mock("../db", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  },
}));

import {
  createClientProfile,
  getClientProfiles,
  createClientReference,
  getClientReferences,
  getClientReferencesByIds,
  getClientReferencesByIdsForProfile,
  resolveCampaignClientProfileId,
  createTrainingReference,
  getTrainingReferences,
  getApprovedTrainingReferences,
  getRejectedTrainingReferences,
  recordTrainingAnalysis,
  reviewTrainingReference,
} from "./client-reference";

describe("client-reference repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereMock.mockReturnValue({ orderBy: orderByMock, returning: returningMock });
    orderByMock.mockResolvedValue([]);
    returningMock.mockResolvedValue([]);
  });

  describe("createClientProfile", () => {
    it("inserts workspace-scoped profile fields", async () => {
      const row = {
        id: "profile-id",
        workspaceId: "ws-1",
        name: "Acme",
        description: "Desc",
        visualNotes: "Visual",
        toneNotes: "Tone",
        constraints: "Constraints",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      returningMock.mockResolvedValue([row]);

      const result = await createClientProfile("ws-1", {
        name: "Acme",
        description: "Desc",
        visualNotes: "Visual",
        toneNotes: "Tone",
        constraints: "Constraints",
      });

      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(valuesMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(row);
    });
  });

  describe("getClientProfiles", () => {
    it("orders by updated date", async () => {
      const rows = [
        { id: "p1", name: "Acme", updatedAt: new Date() },
        { id: "p2", name: "Beta", updatedAt: new Date() },
      ];
      orderByMock.mockResolvedValue(rows);

      const result = await getClientProfiles("ws-1");

      expect(selectMock).toHaveBeenCalledTimes(1);
      expect(fromMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(orderByMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(rows);
    });
  });

  describe("resolveCampaignClientProfileId", () => {
    it("returns linked clientProfileId when present", async () => {
      const result = await resolveCampaignClientProfileId("ws-1", {
        clientProfileId: "profile-linked",
        client: "CENBRAP",
      });

      expect(result).toBe("profile-linked");
      expect(selectMock).not.toHaveBeenCalled();
    });

    it("matches campaign.client to a unique profile name", async () => {
      orderByMock.mockResolvedValue([
        { id: "profile-cenbrap", name: "Cenbrap" },
        { id: "profile-other", name: "Other" },
      ]);

      const result = await resolveCampaignClientProfileId("ws-1", {
        clientProfileId: null,
        client: "CENBRAP",
      });

      expect(result).toBe("profile-cenbrap");
    });

    it("falls back to the sole workspace profile when no name matches", async () => {
      orderByMock.mockResolvedValue([{ id: "profile-other", name: "Other" }]);

      const result = await resolveCampaignClientProfileId("ws-1", {
        clientProfileId: null,
        client: "CENBRAP",
      });

      expect(result).toBe("profile-other");
    });

    it("returns null when multiple profiles exist and no profile matches campaign.client", async () => {
      orderByMock.mockResolvedValue([
        { id: "profile-other", name: "Other" },
        { id: "profile-another", name: "Another" },
      ]);

      const result = await resolveCampaignClientProfileId("ws-1", {
        clientProfileId: null,
        client: "CENBRAP",
      });

      expect(result).toBeNull();
    });
  });

  describe("createClientReference", () => {
    it("inserts assetKey, kind, label, optional sourceDerivationId", async () => {
      const row = {
        id: "ref-id",
        workspaceId: "ws-1",
        clientProfileId: "profile-id",
        assetKey: "assets/key.png",
        label: "Hero",
        kind: "style",
        notes: "Note",
        sourceDerivationId: "derivation-id",
        createdAt: new Date(),
      };
      returningMock.mockResolvedValue([row]);

      const result = await createClientReference("ws-1", {
        clientProfileId: "profile-id",
        assetKey: "assets/key.png",
        label: "Hero",
        kind: "style",
        notes: "Note",
        sourceDerivationId: "derivation-id",
      });

      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(valuesMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(row);
    });
  });

  describe("getClientReferences", () => {
    it("scopes by workspace and clientProfileId", async () => {
      const rows = [{ id: "ref-1", label: "Hero" }];
      orderByMock.mockResolvedValue(rows);

      const result = await getClientReferences("ws-1", "profile-id");

      expect(selectMock).toHaveBeenCalledTimes(1);
      expect(fromMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(orderByMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(rows);
    });
  });

  describe("getClientReferencesByIds", () => {
    it("returns only references matching workspace and selected IDs", async () => {
      const rows = [
        { id: "ref-1", label: "Hero" },
        { id: "ref-2", label: "Logo" },
      ];
      orderByMock.mockResolvedValue(rows);

      const result = await getClientReferencesByIds("ws-1", ["ref-1", "ref-2"]);

      expect(selectMock).toHaveBeenCalledTimes(1);
      expect(fromMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(orderByMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(rows);
    });

    it("returns empty array when ids is empty", async () => {
      const result = await getClientReferencesByIds("ws-1", []);

      expect(selectMock).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe("getClientReferencesByIdsForProfile", () => {
    it("scopes selected references and excludes unreviewed training assets", async () => {
      const rows = [{ id: "ref-1", reviewStatus: "approved" }];
      orderByMock.mockResolvedValue(rows);

      const result = await getClientReferencesByIdsForProfile(
        "ws-1",
        "profile-1",
        ["ref-1"],
      );

      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(orderByMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(rows);
    });
  });

  describe("createTrainingReference", () => {
    it("creates a training reference pending analysis", async () => {
      returningMock.mockResolvedValue([{ id: "ref-1", reviewStatus: "pending_analysis" }]);

      await createTrainingReference("ws-1", {
        clientProfileId: "profile-1",
        assetKey: "workspaces/ws-1/assets/a.png",
        label: "Ondas",
      });

      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          clientProfileId: "profile-1",
          kind: "other",
          reviewStatus: "pending_analysis",
        }),
      );
    });
  });

  describe("getTrainingReferences", () => {
    it("scopes by workspace and clientProfileId and filters to known statuses", async () => {
      const rows = [{ id: "ref-1", reviewStatus: "pending_analysis" }];
      orderByMock.mockResolvedValue(rows);

      const result = await getTrainingReferences("ws-1", "profile-1");

      expect(selectMock).toHaveBeenCalledTimes(1);
      expect(fromMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(orderByMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(rows);
    });
  });

  describe("getApprovedTrainingReferences", () => {
    it("scopes by workspace, profile, and approved status", async () => {
      const rows = [{ id: "ref-1", reviewStatus: "approved" }];
      orderByMock.mockResolvedValue(rows);

      const result = await getApprovedTrainingReferences("ws-1", "profile-1");

      expect(selectMock).toHaveBeenCalledTimes(1);
      expect(fromMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(orderByMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(rows);
    });
  });

  describe("getRejectedTrainingReferences", () => {
    it("scopes by workspace, profile, and rejected status", async () => {
      const rows = [{ id: "ref-1", reviewStatus: "rejected" }];
      orderByMock.mockResolvedValue(rows);

      const result = await getRejectedTrainingReferences("ws-1", "profile-1");

      expect(selectMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(orderByMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(rows);
    });
  });

  describe("recordTrainingAnalysis", () => {
    it("moves the pending_analysis row to pending_approval inside the triple-id scope", async () => {
      returningMock.mockResolvedValue([{ id: "ref-1", reviewStatus: "pending_approval" }]);

      const result = await recordTrainingAnalysis(
        { workspaceId: "ws-1", clientProfileId: "profile-1", referenceId: "ref-1" },
        {
          existingReviewStatus: "pending_analysis",
          trainingCategory: "graphic",
          usageMode: "reference",
          analysis: {
            description: "Ondas",
            visualAttributes: ["green"],
            rules: ["Keep proportions"],
            constraints: ["Do not recolor"],
            confidence: 0.9,
          },
        },
      );

      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          trainingCategory: "graphic",
          usageMode: "reference",
          reviewStatus: "pending_approval",
        }),
      );
      const setArg = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(setArg).not.toHaveProperty("reviewedAt");
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(returningMock).toHaveBeenCalledTimes(1);
      expect(result?.id).toBe("ref-1");
    });

    it("keeps an approved legacy row approved while adding missing analysis", async () => {
      returningMock.mockResolvedValue([{ id: "ref-1", reviewStatus: "approved" }]);

      await recordTrainingAnalysis(
        { workspaceId: "ws-1", clientProfileId: "profile-1", referenceId: "ref-1" },
        {
          existingReviewStatus: "approved",
          trainingCategory: "visual_reference",
          usageMode: "reference",
          analysis: {
            description: "Legacy proposal",
            visualAttributes: [],
            rules: [],
            constraints: [],
            confidence: 0.7,
          },
        },
      );

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ reviewStatus: "approved" }),
      );
    });
  });

  describe("reviewTrainingReference", () => {
    it("records human approval with reviewer identity", async () => {
      returningMock.mockResolvedValue([{ id: "ref-1", reviewStatus: "approved" }]);

      const result = await reviewTrainingReference(
        { workspaceId: "ws-1", clientProfileId: "profile-1", referenceId: "ref-1" },
        {
          trainingCategory: "graphic",
          usageMode: "exact",
          analysis: {
            description: "Ondas",
            visualAttributes: ["green"],
            rules: ["Keep proportions"],
            constraints: ["Do not recolor"],
            confidence: 0.9,
          },
          reviewStatus: "approved",
          reviewedByUserId: "user-1",
        },
      );

      expect(result?.reviewStatus).toBe("approved");
      expect(whereMock).toHaveBeenCalledTimes(1);
    });

    it("sets reviewedAt on archive decisions without wiping analysis", async () => {
      returningMock.mockResolvedValue([{ id: "ref-1", reviewStatus: "archived" }]);

      const result = await reviewTrainingReference(
        { workspaceId: "ws-1", clientProfileId: "profile-1", referenceId: "ref-1" },
        {
          trainingCategory: "graphic",
          usageMode: "reference",
          analysis: null,
          reviewStatus: "archived",
          reviewedByUserId: "user-1",
        },
      );

      expect(result?.reviewStatus).toBe("archived");
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewStatus: "archived",
          reviewedByUserId: "user-1",
        }),
      );
      const setArg = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(setArg).not.toHaveProperty("trainingAnalysis");
      expect(whereMock).toHaveBeenCalledTimes(1);
    });

    it("records a structured rejection without wiping analysis", async () => {
      returningMock.mockResolvedValue([{ id: "ref-1", reviewStatus: "rejected" }]);

      const result = await reviewTrainingReference(
        { workspaceId: "ws-1", clientProfileId: "profile-1", referenceId: "ref-1" },
        {
          trainingCategory: "visual_reference",
          usageMode: "reference",
          analysis: null,
          reviewStatus: "rejected",
          rejectionReason: { code: "brand_drift", note: "Fora da identidade" },
          reviewedByUserId: "user-1",
        },
      );

      expect(result?.reviewStatus).toBe("rejected");
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewStatus: "rejected",
          rejectionReason: { code: "brand_drift", note: "Fora da identidade" },
        }),
      );
      const setArg = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(setArg).not.toHaveProperty("trainingAnalysis");
    });
  });
});
