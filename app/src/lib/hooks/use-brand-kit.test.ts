import { describe, expect, it } from "vitest";
import {
  BrandKitAmbiguousError,
  BrandKitProfileNotFoundError,
  resolveBrandKitClientProfileId,
  shouldFetchBrandKit,
} from "./use-brand-kit";

describe("resolveBrandKitClientProfileId", () => {
  it("prefers the campaign client profile when present", () => {
    expect(
      resolveBrandKitClientProfileId({
        clientProfileId: "profile-a",
        clientProfiles: [{ id: "profile-b" }],
      })
    ).toBe("profile-a");
  });

  it("falls back to the only workspace profile", () => {
    expect(
      resolveBrandKitClientProfileId({
        clientProfiles: [{ id: "profile-only" }],
      })
    ).toBe("profile-only");
  });

  it("returns undefined when multiple profiles exist and none is selected", () => {
    expect(
      resolveBrandKitClientProfileId({
        clientProfiles: [{ id: "profile-a" }, { id: "profile-b" }],
      })
    ).toBeUndefined();
  });
});

describe("shouldFetchBrandKit", () => {
  it("waits for client profiles before fetching without a selected profile", () => {
    expect(
      shouldFetchBrandKit({
        profilesLoaded: false,
        clientProfiles: [{ id: "profile-a" }, { id: "profile-b" }],
      })
    ).toBe(false);
  });

  it("skips fetch when multiple profiles exist and none is selected", () => {
    expect(
      shouldFetchBrandKit({
        profilesLoaded: true,
        clientProfiles: [{ id: "profile-a" }, { id: "profile-b" }],
      })
    ).toBe(false);
  });

  it("allows fetch for single-profile workspaces", () => {
    expect(
      shouldFetchBrandKit({
        profilesLoaded: true,
        clientProfiles: [{ id: "profile-only" }],
      })
    ).toBe(true);
  });
});

describe("brand kit query errors", () => {
  it("exposes typed ambiguity and profile-not-found errors", () => {
    const ambiguity = new BrandKitAmbiguousError("ambiguous", [
      { id: "profile-a", name: "A" },
    ]);
    const notFound = new BrandKitProfileNotFoundError("missing");

    expect(ambiguity).toBeInstanceOf(Error);
    expect(notFound).toBeInstanceOf(Error);
    expect(ambiguity.availableWorkspaces).toHaveLength(1);
  });
});
