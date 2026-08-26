import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTransaction = vi.fn();
const mockDb = {
  transaction: mockTransaction,
  insert: vi.fn(),
  select: vi.fn(),
};

const mockCreatePendingTrialEntitlement = vi.fn();
const mockActivateSignupTrialForOwner = vi.fn();
const mockIsDevAdminEmail = vi.fn();
const mockEnsureDevAdminEmailVerified = vi.fn();

let capturedConfig: any = null;

vi.mock("server-only", () => ({}));

vi.mock("better-auth", () => ({
  betterAuth: vi.fn((config) => {
    capturedConfig = config;
    return {
      options: config,
      api: {},
      handler: vi.fn(),
    };
  }),
}));

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: vi.fn(() => ({})),
}));

vi.mock("better-auth/plugins/magic-link", () => ({
  magicLink: vi.fn(() => ({})),
}));

vi.mock("../db", () => ({
  db: mockDb,
}));

vi.mock("../db/schema", () => ({
  workspaces: { id: "workspaces" },
  workspaceMembers: { id: "workspaceMembers" },
}));

vi.mock("../validation/env", () => ({
  env: {
    BETTER_AUTH_SECRET: "test-secret",
    BETTER_AUTH_URL: "https://auth.example.com",
    APP_URL: "https://app.example.com",
  },
}));

vi.mock("../services/email", () => ({
  sendPasswordResetEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendMagicLinkEmail: vi.fn(),
}));

vi.mock("../repositories/user", () => ({
  getLocaleByEmail: vi.fn().mockResolvedValue("pt-BR"),
  getUserLocale: vi.fn().mockResolvedValue("pt-BR"),
}));

vi.mock("./config", () => ({
  buildTrustedOrigins: vi.fn(() => []),
}));

vi.mock("@/lib/rate-limit", () => ({
  isRateLimitDisabled: vi.fn(() => true),
  isDevOnlyFeatureEnabled: vi.fn(() => false),
}));

vi.mock("./e2e-reset-store", () => ({
  rememberResetUrl: vi.fn(),
}));

vi.mock("./dev-admin", () => ({
  isDevAdminEmail: (...args: unknown[]) => mockIsDevAdminEmail(...args),
  ensureDevAdminEmailVerified: (...args: unknown[]) =>
    mockEnsureDevAdminEmailVerified(...args),
}));

vi.mock("../ai/providers/e2e-controlled-provider", () => ({
  isE2EControlledProviderEnabled: vi.fn(() => false),
}));

vi.mock("../billing/trial", () => ({
  createPendingTrialEntitlement: (...args: unknown[]) =>
    mockCreatePendingTrialEntitlement(...args),
  activateSignupTrialForOwner: (...args: unknown[]) =>
    mockActivateSignupTrialForOwner(...args),
}));

describe("signup trial and email verification wiring in auth", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsDevAdminEmail.mockReturnValue(false);
    // Import auth to ensure capturedConfig is populated
    await import("./index");
  });

  describe("databaseHooks.user.create.after", () => {
    it("creates workspace, owner membership, and pending trial entitlement in one transaction for standard user", async () => {
      const mockWorkspace = { id: "ws-new-1234", name: "Alice's Workspace", slug: "workspace-user-123" };
      const mockTxInsert = vi.fn();

      // Workspace insert returns [mockWorkspace]
      mockTxInsert.mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockWorkspace]),
        }),
      });
      // Membership insert returns void/anything
      mockTxInsert.mockReturnValueOnce({
        values: vi.fn().mockResolvedValue([{}]),
      });

      const mockTx = {
        insert: mockTxInsert,
      };

      mockTransaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
        return cb(mockTx);
      });

      mockCreatePendingTrialEntitlement.mockResolvedValue({
        id: "ent-pending-1",
        workspaceId: mockWorkspace.id,
        kind: "trial",
        status: "pending_verification",
      });

      const user = {
        id: "user-12345678-abcd",
        name: "Alice",
        email: "alice@example.com",
      };

      const afterHook = capturedConfig.databaseHooks.user.create.after;
      expect(afterHook).toBeDefined();

      await afterHook(user);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockTxInsert).toHaveBeenCalledTimes(2);
      expect(mockCreatePendingTrialEntitlement).toHaveBeenCalledTimes(1);
      expect(mockCreatePendingTrialEntitlement).toHaveBeenCalledWith(
        {
          workspaceId: "ws-new-1234",
          userId: "user-12345678-abcd",
        },
        mockTx
      );
    });

    it("skips pending trial entitlement creation for dev-admin user", async () => {
      mockIsDevAdminEmail.mockReturnValue(true);

      const mockWorkspace = { id: "ws-admin-1", name: "Admin's Workspace", slug: "workspace-admin-12" };
      const mockTxInsert = vi.fn();

      mockTxInsert.mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockWorkspace]),
        }),
      });
      mockTxInsert.mockReturnValueOnce({
        values: vi.fn().mockResolvedValue([{}]),
      });

      const mockTx = {
        insert: mockTxInsert,
      };

      mockTransaction.mockImplementation(async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
        return cb(mockTx);
      });

      const user = {
        id: "admin-12345678-abcd",
        name: "Admin User",
        email: "admin@adscale.local",
      };

      const afterHook = capturedConfig.databaseHooks.user.create.after;
      await afterHook(user);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockTxInsert).toHaveBeenCalledTimes(2);
      expect(mockCreatePendingTrialEntitlement).not.toHaveBeenCalled();
    });

    it("propagates transaction errors when workspace or trial creation fails", async () => {
      mockTransaction.mockRejectedValueOnce(new Error("Transaction abort"));

      const user = {
        id: "user-fail-1234",
        name: "Failing User",
        email: "fail@example.com",
      };

      const afterHook = capturedConfig.databaseHooks.user.create.after;
      await expect(afterHook(user)).rejects.toThrow("Transaction abort");
    });
  });

  describe("emailVerification.afterEmailVerification", () => {
    it("calls activateSignupTrialForOwner once with the verified user id", async () => {
      mockActivateSignupTrialForOwner.mockResolvedValue({
        status: "activated",
        entitlement: { id: "ent-1", status: "active" },
        grant: { id: "grant-1", amount: 500 },
      });

      const user = {
        id: "verified-user-123",
        email: "verified@example.com",
      };

      const afterEmailVerification = capturedConfig.emailVerification.afterEmailVerification;
      expect(afterEmailVerification).toBeDefined();

      await afterEmailVerification(user);

      expect(mockActivateSignupTrialForOwner).toHaveBeenCalledTimes(1);
      expect(mockActivateSignupTrialForOwner).toHaveBeenCalledWith("verified-user-123");
    });

    it("propagates failures from activateSignupTrialForOwner so auth boundary logs them", async () => {
      mockActivateSignupTrialForOwner.mockRejectedValue(
        new Error("Activation database deadlock")
      );

      const user = {
        id: "verified-user-deadlock",
        email: "deadlock@example.com",
      };

      const afterEmailVerification = capturedConfig.emailVerification.afterEmailVerification;
      await expect(afterEmailVerification(user)).rejects.toThrow(
        "Activation database deadlock"
      );
    });
  });
});
