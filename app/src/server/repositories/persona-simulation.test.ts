import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  insertMock,
  valuesMock,
  returningMock,
  updateMock,
  setMock,
  selectMock,
  fromMock,
  whereMock,
} = vi.hoisted(() => {
  const whereMock = vi.fn();
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const returningMock = vi.fn();
  const updateWhereMock = vi.fn(() => ({ returning: returningMock }));
  const setMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));

  const valuesMock = vi.fn(() => ({ returning: returningMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));

  return {
    insertMock,
    valuesMock,
    returningMock,
    updateMock,
    setMock,
    selectMock,
    fromMock,
    whereMock,
  };
});

vi.mock("../db", () => ({
  db: {
    insert: insertMock,
    update: updateMock,
    select: selectMock,
  },
}));

import {
  createPersonaSimulation,
  getPersonaSimulationBySource,
  updatePersonaSimulation,
  isCacheValid,
} from "./persona-simulation";

const mockResults = {
  skeptical_buyer: {
    understands: "The offer is 20% off.",
    rejects: "No social proof.",
    wants: "More details.",
    wouldClick: false,
    rationale: "Skeptical about claims.",
  },
  warm_lead: {
    understands: "The offer is 20% off.",
    rejects: "Nothing.",
    wants: "To buy now.",
    wouldClick: true,
    rationale: "Already interested.",
  },
  financial_decision_maker: {
    understands: "ROI focused.",
    rejects: "Vague pricing.",
    wants: "Exact numbers.",
    wouldClick: false,
    rationale: "Needs concrete data.",
  },
  beginner: {
    understands: "Simple message.",
    rejects: "Complex terms.",
    wants: "Easy onboarding.",
    wouldClick: true,
    rationale: "Clear and friendly.",
  },
};

describe("persona simulation repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    returningMock.mockResolvedValue([]);
    whereMock.mockResolvedValue([]);
  });

  describe("createPersonaSimulation", () => {
    it("inserts a completed persona simulation record", async () => {
      const row = {
        id: "ps-1",
        workspaceId: "ws-1",
        campaignId: "camp-1",
        sourceType: "derivation",
        sourceId: "der-1",
        status: "completed",
        results: mockResults,
      };
      returningMock.mockResolvedValue([row]);

      const result = await createPersonaSimulation(
        "ws-1",
        "camp-1",
        "derivation",
        "der-1",
        mockResults
      );

      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: "ws-1",
          campaignId: "camp-1",
          sourceType: "derivation",
          sourceId: "der-1",
          status: "completed",
          error: null,
        })
      );
      expect(result).toBe(row);
    });
  });

  describe("getPersonaSimulationBySource", () => {
    it("selects by workspace, sourceType, and sourceId", async () => {
      const row = {
        id: "ps-1",
        workspaceId: "ws-1",
        sourceType: "landing_page",
        sourceId: "lp-1",
        status: "completed",
      };
      whereMock.mockResolvedValue([row]);

      const result = await getPersonaSimulationBySource("ws-1", "landing_page", "lp-1");

      expect(selectMock).toHaveBeenCalledTimes(1);
      expect(fromMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(row);
    });

    it("returns undefined when no row matches", async () => {
      whereMock.mockResolvedValue([]);

      const result = await getPersonaSimulationBySource("ws-1", "derivation", "der-1");

      expect(result).toBeUndefined();
    });
  });

  describe("updatePersonaSimulation", () => {
    it("updates results and sets status to completed", async () => {
      const row = {
        id: "ps-1",
        status: "completed",
        results: mockResults,
      };
      returningMock.mockResolvedValue([row]);

      const result = await updatePersonaSimulation("ps-1", mockResults);

      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "completed",
          error: null,
        })
      );
      expect(result).toBe(row);
    });
  });

  describe("isCacheValid", () => {
    it("returns true when cache has not expired", () => {
      const simulation = {
        id: "ps-1",
        status: "completed",
        cacheExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      } as Parameters<typeof isCacheValid>[0];

      expect(isCacheValid(simulation)).toBe(true);
    });

    it("returns false when cache has expired", () => {
      const simulation = {
        id: "ps-1",
        status: "completed",
        cacheExpiresAt: new Date(Date.now() - 1000 * 60),
      } as Parameters<typeof isCacheValid>[0];

      expect(isCacheValid(simulation)).toBe(false);
    });

    it("returns false when status is not completed", () => {
      const simulation = {
        id: "ps-1",
        status: "pending",
        cacheExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      } as Parameters<typeof isCacheValid>[0];

      expect(isCacheValid(simulation)).toBe(false);
    });

    it("returns false when cacheExpiresAt is null", () => {
      const simulation = {
        id: "ps-1",
        status: "completed",
        cacheExpiresAt: null,
      } as Parameters<typeof isCacheValid>[0];

      expect(isCacheValid(simulation)).toBe(false);
    });
  });
});
