import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  whereMock,
  orderByMock,
  fromMock,
  selectMock,
  insertMock,
  valuesMock,
  returningMock,
} = vi.hoisted(() => {
  const whereMock = vi.fn();
  const orderByMock = vi.fn();
  const fromMock = vi.fn(() => ({ where: whereMock, orderBy: orderByMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const returningMock = vi.fn();
  const valuesMock = vi.fn(() => ({ returning: returningMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  return {
    whereMock,
    orderByMock,
    fromMock,
    selectMock,
    insertMock,
    valuesMock,
    returningMock,
  };
});

vi.mock("../db", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
  },
}));

import {
  createClientProfile,
  getClientProfiles,
  createClientReference,
  getClientReferences,
  getClientReferencesByIds,
} from "./client-reference";

describe("client-reference repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereMock.mockReturnValue({ orderBy: orderByMock });
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
});
