import { describe, expect, it } from "vitest";
import { mapSettingsToV6Cards } from "./map-settings-v6";

describe("mapSettingsToV6Cards", () => {
  it("exposes user-facing availability and next actions", () => {
    const cards = mapSettingsToV6Cards({ t: (key) => key });

    expect(cards.find((card) => card.id === "profile")).toEqual(expect.objectContaining({
      badge: "v6.statuses.available",
      actionLabel: "v6.actions.available",
    }));
    expect(cards.find((card) => card.id === "billing")).toEqual(expect.objectContaining({
      badge: "v6.statuses.requiresConfiguration",
      actionLabel: "v6.actions.requiresConfiguration",
    }));
    expect(cards.find((card) => card.id === "integrations")).toEqual(expect.objectContaining({
      badge: "v6.statuses.comingSoon",
      actionLabel: "v6.actions.comingSoon",
      enabled: false,
    }));
  });
});
