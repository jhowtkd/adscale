import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db", () => ({
  db: { insert: vi.fn() },
}));

import { db } from "@/server/db";
import { recordAdminAuditLog } from "./admin-audit";

describe("recordAdminAuditLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts audit row with required fields", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "audit-1" }]);
    const values = vi.fn().mockReturnValue({ returning });
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    const id = await recordAdminAuditLog({
      actorEmail: "owner@example.com",
      action: "credits.adjust",
      targetType: "workspace",
      targetId: "ws-1",
      payload: { before: 10, after: 20, delta: 10 },
      reason: "Beta support grant",
      status: "success",
    });

    expect(id).toBe("audit-1");
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: "owner@example.com",
        action: "credits.adjust",
        reason: "Beta support grant",
      })
    );
  });
});
