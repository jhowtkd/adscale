import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  activateSignupTrial,
  activateSignupTrialForOwner,
  createPendingTrialEntitlement,
  ENTITLEMENT_STATUS_PENDING_VERIFICATION,
  TRIAL_CREDIT_GRANT_SOURCE,
  TRIAL_ENTITLEMENT_KIND,
} from "./trial";
import {
  createCreditGrant,
  getCreditGrantBySourceId,
} from "@/server/repositories/billing";
import {
  getTrialEntitlementByWorkspaceForUpdate,
  updateEntitlementStatus,
} from "@/server/repositories/entitlements";
import { db } from "@/server/db";
import { TRIAL_CREDIT_GRANT } from "@/lib/billing/credit-units";

vi.mock("@/server/db", () => {
  const mockTx = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  return {
    db: {
      transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
    },
  };
});

vi.mock("@/server/repositories/billing", () => ({
  createCreditGrant: vi.fn(),
  getCreditGrantBySourceId: vi.fn(),
}));

vi.mock("@/server/repositories/entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/repositories/entitlements")>();
  return {
    ...actual,
    getTrialEntitlementByWorkspaceForUpdate: vi.fn(),
    updateEntitlementStatus: vi.fn(),
  };
});

const mockDbTransaction = vi.mocked(db.transaction);
const mockCreateCreditGrant = vi.mocked(createCreditGrant);
const mockGetCreditGrantBySourceId = vi.mocked(getCreditGrantBySourceId);
const mockGetTrialEntitlementByWorkspaceForUpdate = vi.mocked(
  getTrialEntitlementByWorkspaceForUpdate
);
const mockUpdateEntitlementStatus = vi.mocked(updateEntitlementStatus);

describe("trial constants", () => {
  it("defines correct trial constants", () => {
    expect(TRIAL_ENTITLEMENT_KIND).toBe("trial");
    expect(ENTITLEMENT_STATUS_PENDING_VERIFICATION).toBe("pending_verification");
    expect(TRIAL_CREDIT_GRANT_SOURCE).toBe("signup_trial");
    expect(TRIAL_CREDIT_GRANT).toBe(500);
  });
});

describe("createPendingTrialEntitlement", () => {
  it("inserts a pending trial entitlement row into workspace_entitlements", async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "ent-1",
            workspaceId: "ws-1",
            kind: "trial",
            status: "pending_verification",
            sourceCode: null,
            redeemedByUserId: "user-1",
            metadata: null,
            startsAt: new Date(),
            expiresAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      }),
    });

    const mockTx = { insert: mockInsert } as unknown as Parameters<
      typeof createPendingTrialEntitlement
    >[1];

    const result = await createPendingTrialEntitlement(
      { workspaceId: "ws-1", userId: "user-1" },
      mockTx
    );

    expect(mockInsert).toHaveBeenCalled();
    expect(result).toMatchObject({
      id: "ent-1",
      workspaceId: "ws-1",
      kind: "trial",
      status: "pending_verification",
      redeemedByUserId: "user-1",
    });
  });
});

describe("entitlements repository helpers", () => {
  it("getTrialEntitlementByWorkspace queries trial entitlement without lock", async () => {
    const { getTrialEntitlementByWorkspace } = await vi.importActual<
      typeof import("@/server/repositories/entitlements")
    >("@/server/repositories/entitlements");

    const mockRow = { id: "ent-1", kind: "trial", status: "pending_verification" };
    const mockClient = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockRow]),
          }),
        }),
      }),
    };

    const result = await getTrialEntitlementByWorkspace(
      "ws-1",
      mockClient as never,
      false
    );

    expect(result).toEqual(mockRow);
  });

  it("getTrialEntitlementByWorkspace queries trial entitlement with lock (for update)", async () => {
    const { getTrialEntitlementByWorkspace } = await vi.importActual<
      typeof import("@/server/repositories/entitlements")
    >("@/server/repositories/entitlements");

    const mockRow = { id: "ent-1", kind: "trial", status: "pending_verification" };
    const mockFor = vi.fn().mockResolvedValue([mockRow]);
    const mockClient = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              for: mockFor,
            }),
          }),
        }),
      }),
    };

    const result = await getTrialEntitlementByWorkspace(
      "ws-1",
      mockClient as never,
      true
    );

    expect(mockFor).toHaveBeenCalledWith("update");
    expect(result).toEqual(mockRow);
  });

  it("getTrialEntitlementByWorkspaceForUpdate delegates with lock=true", async () => {
    const { getTrialEntitlementByWorkspaceForUpdate } = await vi.importActual<
      typeof import("@/server/repositories/entitlements")
    >("@/server/repositories/entitlements");

    const mockRow = { id: "ent-1", kind: "trial", status: "pending_verification" };
    const mockFor = vi.fn().mockResolvedValue([mockRow]);
    const mockClient = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              for: mockFor,
            }),
          }),
        }),
      }),
    };

    const result = await getTrialEntitlementByWorkspaceForUpdate(
      "ws-1",
      mockClient as never
    );

    expect(mockFor).toHaveBeenCalledWith("update");
    expect(result).toEqual(mockRow);
  });

  it("getActiveTrialEntitlementByWorkspace queries active trial entitlement", async () => {
    const { getActiveTrialEntitlementByWorkspace } = await vi.importActual<
      typeof import("@/server/repositories/entitlements")
    >("@/server/repositories/entitlements");

    const mockRow = { id: "ent-1", kind: "trial", status: "active" };
    const mockClient = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockRow]),
          }),
        }),
      }),
    };

    const result = await getActiveTrialEntitlementByWorkspace(
      "ws-1",
      mockClient as never
    );

    expect(result).toEqual(mockRow);
  });

  it("updateEntitlementStatus updates status and returns updated row", async () => {
    const { updateEntitlementStatus: actualUpdateEntitlementStatus } = await vi.importActual<
      typeof import("@/server/repositories/entitlements")
    >("@/server/repositories/entitlements");

    const mockRow = { id: "ent-1", kind: "trial", status: "active" };
    const mockClient = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockRow]),
          }),
        }),
      }),
    };

    const result = await actualUpdateEntitlementStatus(
      "ent-1",
      "active",
      mockClient as never
    );

    expect(result).toEqual(mockRow);
  });
});

describe("activateSignupTrial", () => {
  const workspaceId = "ws-trial-1";
  const ownerUserId = "user-owner-1";
  const nonOwnerUserId = "user-member-1";

  const pendingEntitlement = {
    id: "ent-trial-1",
    workspaceId,
    kind: "trial",
    status: "pending_verification",
    sourceCode: null,
    redeemedByUserId: ownerUserId,
    metadata: null,
    startsAt: new Date(),
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const activeEntitlement = {
    ...pendingEntitlement,
    status: "active",
  };

  const trialCreditGrant = {
    id: "grant-trial-1",
    workspaceId,
    source: "signup_trial",
    sourceId: pendingEntitlement.id,
    amount: 500,
    remaining: 500,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockTxSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTxSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ role: "owner" }]),
        }),
      }),
    });

    mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb({
        select: mockTxSelect,
      });
    });

    mockGetTrialEntitlementByWorkspaceForUpdate.mockResolvedValue(pendingEntitlement);
    mockCreateCreditGrant.mockResolvedValue(trialCreditGrant);
    mockUpdateEntitlementStatus.mockResolvedValue(activeEntitlement);
    mockGetCreditGrantBySourceId.mockResolvedValue(null);
  });

  it("activates pending trial, creating a 500-credit grant with sourceId = entitlement.id and no expiry", async () => {
    const result = await activateSignupTrial({
      workspaceId,
      userId: ownerUserId,
    });

    expect(result.status).toBe("activated");
    if (result.status === "activated") {
      expect(result.entitlement.status).toBe("active");
      expect(result.grant.amount).toBe(500);
      expect(result.grant.remaining).toBe(500);
      expect(result.grant.source).toBe("signup_trial");
      expect(result.grant.sourceId).toBe(pendingEntitlement.id);
      expect(result.grant.expiresAt).toBeNull();
    }

    expect(mockGetTrialEntitlementByWorkspaceForUpdate).toHaveBeenCalledWith(
      workspaceId,
      expect.anything()
    );
    expect(mockCreateCreditGrant).toHaveBeenCalledWith(
      {
        workspaceId,
        source: "signup_trial",
        sourceId: pendingEntitlement.id,
        amount: 500,
        expiresAt: null,
      },
      expect.anything()
    );
    expect(mockUpdateEntitlementStatus).toHaveBeenCalledWith(
      pendingEntitlement.id,
      "active",
      expect.anything()
    );
  });

  it("is idempotent on repeated activation and returns existing grant with already_active status", async () => {
    mockGetTrialEntitlementByWorkspaceForUpdate.mockResolvedValue(activeEntitlement);
    mockGetCreditGrantBySourceId.mockResolvedValue(trialCreditGrant);

    const result = await activateSignupTrial({
      workspaceId,
      userId: ownerUserId,
    });

    expect(result.status).toBe("already_active");
    if (result.status === "already_active") {
      expect(result.entitlement.status).toBe("active");
      expect(result.grant.id).toBe(trialCreditGrant.id);
      expect(result.grant.amount).toBe(500);
    }

    expect(mockCreateCreditGrant).not.toHaveBeenCalled();
    expect(mockUpdateEntitlementStatus).not.toHaveBeenCalled();
    expect(mockGetCreditGrantBySourceId).toHaveBeenCalledWith(
      "signup_trial",
      activeEntitlement.id,
      expect.anything()
    );
  });

  it("uses row-level locking (FOR UPDATE) inside transaction for concurrency safety", async () => {
    await activateSignupTrial({
      workspaceId,
      userId: ownerUserId,
    });

    expect(mockGetTrialEntitlementByWorkspaceForUpdate).toHaveBeenCalledWith(
      workspaceId,
      expect.anything()
    );
  });

  it("handles concurrent activation where second call sees active status and returns already_active", async () => {
    mockGetTrialEntitlementByWorkspaceForUpdate.mockResolvedValue(activeEntitlement);
    mockGetCreditGrantBySourceId.mockResolvedValue(trialCreditGrant);

    const result = await activateSignupTrial({
      workspaceId,
      userId: ownerUserId,
    });

    expect(result.status).toBe("already_active");
    expect(mockCreateCreditGrant).not.toHaveBeenCalled();
  });

  it("returns not_eligible when user is not workspace owner", async () => {
    mockTxSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ role: "member" }]),
        }),
      }),
    });

    const result = await activateSignupTrial({
      workspaceId,
      userId: nonOwnerUserId,
    });

    expect(result).toEqual({
      status: "not_eligible",
      entitlement: null,
      grant: null,
    });
    expect(mockGetTrialEntitlementByWorkspaceForUpdate).not.toHaveBeenCalled();
    expect(mockCreateCreditGrant).not.toHaveBeenCalled();
  });

  it("returns not_eligible when user has no workspace membership", async () => {
    mockTxSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const result = await activateSignupTrial({
      workspaceId,
      userId: "unknown-user",
    });

    expect(result).toEqual({
      status: "not_eligible",
      entitlement: null,
      grant: null,
    });
    expect(mockGetTrialEntitlementByWorkspaceForUpdate).not.toHaveBeenCalled();
    expect(mockCreateCreditGrant).not.toHaveBeenCalled();
  });

  it("returns not_eligible when pending trial entitlement is missing", async () => {
    mockGetTrialEntitlementByWorkspaceForUpdate.mockResolvedValue(null);

    const result = await activateSignupTrial({
      workspaceId,
      userId: ownerUserId,
    });

    expect(result).toEqual({
      status: "not_eligible",
      entitlement: null,
      grant: null,
    });
    expect(mockCreateCreditGrant).not.toHaveBeenCalled();
  });

  it("returns not_eligible when trial entitlement has an unsupported status like revoked", async () => {
    mockGetTrialEntitlementByWorkspaceForUpdate.mockResolvedValue({
      ...pendingEntitlement,
      status: "revoked",
    });

    const result = await activateSignupTrial({
      workspaceId,
      userId: ownerUserId,
    });

    expect(result).toEqual({
      status: "not_eligible",
      entitlement: null,
      grant: null,
    });
    expect(mockCreateCreditGrant).not.toHaveBeenCalled();
  });

  it("rolls back transaction and propagates error if grant creation fails", async () => {
    const error = new Error("Database insert failure");
    mockCreateCreditGrant.mockRejectedValueOnce(error);

    mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb({
        select: mockTxSelect,
      });
    });

    await expect(
      activateSignupTrial({
        workspaceId,
        userId: ownerUserId,
      })
    ).rejects.toThrow("Database insert failure");

    expect(mockUpdateEntitlementStatus).not.toHaveBeenCalled();
  });
});

describe("activateSignupTrialForOwner", () => {
  const ownerUserId = "user-owner-1";
  const workspaceId = "ws-trial-1";

  const pendingEntitlement = {
    id: "ent-trial-1",
    workspaceId,
    kind: "trial",
    status: "pending_verification",
    sourceCode: null,
    redeemedByUserId: ownerUserId,
    metadata: null,
    startsAt: new Date(),
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const activeEntitlement = {
    ...pendingEntitlement,
    status: "active",
  };

  const trialCreditGrant = {
    id: "grant-trial-1",
    workspaceId,
    source: "signup_trial",
    sourceId: pendingEntitlement.id,
    amount: 500,
    remaining: 500,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockTxSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTxSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ role: "owner" }]),
        }),
      }),
    });

    mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb({
        select: mockTxSelect,
      });
    });

    mockGetTrialEntitlementByWorkspaceForUpdate.mockResolvedValue(pendingEntitlement);
    mockCreateCreditGrant.mockResolvedValue(trialCreditGrant);
    mockUpdateEntitlementStatus.mockResolvedValue(activeEntitlement);
    mockGetCreditGrantBySourceId.mockResolvedValue(null);
  });

  it("finds owner workspace and activates signup trial successfully", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ workspaceId }]),
          }),
        }),
      }),
    } as never);

    const result = await activateSignupTrialForOwner(ownerUserId);

    expect(result.status).toBe("activated");
    if (result.status === "activated") {
      expect(result.entitlement.status).toBe("active");
      expect(result.grant.amount).toBe(500);
    }
  });

  it("returns not_eligible when user is not an owner of any workspace", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as never);

    const result = await activateSignupTrialForOwner("non-owner-user");

    expect(result).toEqual({
      status: "not_eligible",
      entitlement: null,
      grant: null,
    });
  });

  it("propagates errors thrown during trial activation", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ workspaceId }]),
          }),
        }),
      }),
    } as never);

    mockCreateCreditGrant.mockRejectedValueOnce(new Error("Credit grant failure"));

    await expect(activateSignupTrialForOwner(ownerUserId)).rejects.toThrow(
      "Credit grant failure"
    );
  });
});

