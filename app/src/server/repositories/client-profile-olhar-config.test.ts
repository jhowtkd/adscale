import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  whereMock,
  limitMock,
  fromMock,
  selectMock,
  insertMock,
  valuesMock,
  onConflictDoUpdateMock,
  returningMock,
} = vi.hoisted(() => {
  const limitMock = vi.fn();
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const returningMock = vi.fn();
  const onConflictDoUpdateMock = vi.fn(() => ({ returning: returningMock }));
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  return {
    whereMock,
    limitMock,
    fromMock,
    selectMock,
    insertMock,
    valuesMock,
    onConflictDoUpdateMock,
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
  getOlharVoiceConfigByClientProfileId,
  upsertOlharVoiceConfig,
} from "./client-profile-olhar-config";

const sampleConfig = {
  principles: ["Principle one"],
  positiveSignals: ["Positive"],
  negativeSignals: ["Negative"],
  authorityAndClaims: ["Authority"],
  inviteRhythm: ["Invite"],
  correctButSoulless: ["Soulless"],
};

const sampleRow = {
  clientProfileId: "profile-1",
  workspaceId: "ws-1",
  voiceId: "cenbrap",
  displayName: "Cenbrap",
  config: sampleConfig,
  reviewStatus: "approved" as const,
  source: "seeded",
  approvedAt: new Date("2026-06-23T00:00:00.000Z"),
  approvedBy: null,
  createdAt: new Date("2026-06-23T00:00:00.000Z"),
  updatedAt: new Date("2026-06-23T00:00:00.000Z"),
};

describe("client-profile-olhar-config repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockResolvedValue([]);
    returningMock.mockResolvedValue([sampleRow]);
  });

  describe("getOlharVoiceConfigByClientProfileId", () => {
    it("returns row when config exists for workspace and profile", async () => {
      limitMock.mockResolvedValue([sampleRow]);

      const result = await getOlharVoiceConfigByClientProfileId({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
      });

      expect(selectMock).toHaveBeenCalledTimes(1);
      expect(fromMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(limitMock).toHaveBeenCalledWith(1);
      expect(result).toBe(sampleRow);
    });

    it("returns null when no config exists", async () => {
      limitMock.mockResolvedValue([]);

      const result = await getOlharVoiceConfigByClientProfileId({
        workspaceId: "ws-1",
        clientProfileId: "missing-profile",
      });

      expect(result).toBeNull();
    });

    it("returns null when workspace does not match (isolation)", async () => {
      limitMock.mockResolvedValue([]);

      const result = await getOlharVoiceConfigByClientProfileId({
        workspaceId: "ws-other",
        clientProfileId: "profile-1",
      });

      expect(result).toBeNull();
    });
  });

  describe("upsertOlharVoiceConfig", () => {
    it("inserts or updates config with workspace scoping", async () => {
      const result = await upsertOlharVoiceConfig({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        voiceId: "cenbrap",
        displayName: "Cenbrap",
        config: sampleConfig,
        reviewStatus: "approved",
        source: "seeded",
        approvedAt: new Date("2026-06-23T00:00:00.000Z"),
      });

      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(valuesMock).toHaveBeenCalledTimes(1);
      expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
      expect(returningMock).toHaveBeenCalledTimes(1);
      expect(result).toBe(sampleRow);
    });
  });
});
