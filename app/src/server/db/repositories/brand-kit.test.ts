import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  updateResult: [] as unknown[],
  insertResult: [] as unknown[],
}));

vi.mock("../../db", () => {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(async () => state.selectResults.shift() ?? []),
    then(resolve: (value: unknown) => void) {
      resolve(state.selectResults.shift() ?? []);
    },
  };

  return {
    db: {
      select: vi.fn(() => chain),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => state.insertResult),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => state.updateResult),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(undefined)),
      })),
    },
  };
});

import {
  BrandKitAmbiguityError,
  deleteBrandKit,
  getBrandKit,
  getBrandKitByWorkspace,
  resolveBrandKitProfileId,
  upsertBrandKit,
} from "./brand-kit";

describe("brand-kit repository", () => {
  beforeEach(() => {
    state.selectResults = [];
    state.updateResult = [];
    state.insertResult = [];
  });

  describe("resolveBrandKitProfileId", () => {
    it("returns explicit clientProfileId when it belongs to the workspace", async () => {
      state.selectResults.push([{ id: "profile-a" }]);

      await expect(resolveBrandKitProfileId("ws-1", "profile-a")).resolves.toBe("profile-a");
    });

    it("falls back to the sole workspace profile", async () => {
      state.selectResults.push([{ id: "profile-only" }]);

      await expect(resolveBrandKitProfileId("ws-1")).resolves.toBe("profile-only");
    });

    it("throws when multiple profiles exist without clientProfileId", async () => {
      state.selectResults.push([
        { id: "profile-a" },
        { id: "profile-b" },
      ]);

      await expect(resolveBrandKitProfileId("ws-1")).rejects.toBeInstanceOf(
        BrandKitAmbiguityError
      );
    });
  });

  describe("getBrandKitByWorkspace", () => {
    it("returns the sole profile and null when ambiguous", async () => {
      state.selectResults.push([{ id: "profile-only", name: "Acme" }]);
      await expect(getBrandKitByWorkspace("ws-1")).resolves.toEqual({
        id: "profile-only",
        name: "Acme",
      });

      state.selectResults.push([
        { id: "profile-a", name: "Acme" },
        { id: "profile-b", name: "Beta" },
      ]);
      await expect(getBrandKitByWorkspace("ws-1")).resolves.toBeNull();
    });
  });

  describe("upsertBrandKit", () => {
    it("updates the targeted profile when clientProfileId is provided", async () => {
      state.selectResults.push([]);
      state.selectResults.push([{ id: "profile-a" }]);
      state.updateResult = [{ id: "profile-a", toneOfVoice: "Direct", workspaceId: "ws-1" }];

      const result = await upsertBrandKit(
        "ws-1",
        { toneOfVoice: "Direct" },
        "profile-a"
      );

      expect(result).toEqual({ id: "profile-a", toneOfVoice: "Direct", workspaceId: "ws-1" });
    });

    it("rejects ambiguous workspace writes without clientProfileId", async () => {
      state.selectResults.push([
        { id: "profile-a" },
        { id: "profile-b" },
      ]);

      await expect(upsertBrandKit("ws-1", { toneOfVoice: "Direct" })).rejects.toBeInstanceOf(
        BrandKitAmbiguityError
      );
    });
  });

  describe("deleteBrandKit", () => {
    it("clears brand fields for the resolved profile", async () => {
      state.selectResults.push([{ id: "profile-a" }]);
      state.selectResults.push([
        { id: "profile-a", logoAssetKey: null, workspaceId: "ws-1" },
      ]);
      state.updateResult = [{ id: "profile-a", logoAssetKey: null, workspaceId: "ws-1" }];

      const result = await deleteBrandKit("ws-1", "profile-a");
      expect(result).toEqual({ id: "profile-a", logoAssetKey: null, workspaceId: "ws-1" });
    });
  });

  describe("getBrandKit", () => {
    it("loads brand kit for an explicit profile", async () => {
      state.selectResults.push([{ id: "profile-a" }]);
      state.selectResults.push([
        { id: "profile-a", toneOfVoice: "Playful", workspaceId: "ws-1" },
      ]);

      await expect(getBrandKit("ws-1", "profile-a")).resolves.toEqual({
        id: "profile-a",
        toneOfVoice: "Playful",
        workspaceId: "ws-1",
      });
    });
  });
});
