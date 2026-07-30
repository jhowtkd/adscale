import { describe, expect, it } from "vitest";

import { MAX_CLIENT_NOTIFICATIONS, capNotifications } from "./use-notifications";

describe("capNotifications", () => {
  it("keeps the newest deterministic window", () => {
    const items = Array.from({ length: MAX_CLIENT_NOTIFICATIONS + 2 }, (_, index) => ({
      id: `notification-${String(index).padStart(2, "0")}`,
      userId: "user-1",
      workspaceId: "workspace-1",
      type: "derivation_complete",
      title: "Pronto",
      message: "ok",
      derivationId: null,
      campaignId: null,
      readAt: null,
      createdAt: new Date(Date.UTC(2026, 6, index + 1)),
      updatedAt: new Date(Date.UTC(2026, 6, index + 1)),
    }));

    const capped = capNotifications(items);

    expect(capped).toHaveLength(MAX_CLIENT_NOTIFICATIONS);
    expect(capped[0]?.id).toBe("notification-51");
    expect(capped.at(-1)?.id).toBe("notification-02");
  });
});
