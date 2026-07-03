import { beforeEach, describe, expect, it, vi } from "vitest";

// Side-effect import to register action contracts (including start_brand_training).
import "@/server/assistant/action-contracts/contracts";

// Imported AFTER the vi.mock below is hoisted; resolves to the mocked versions.
import {
  BrandKitAmbiguityError,
  BrandKitProfileNotFoundError,
} from "@/server/db/repositories/brand-kit";
import { executeStartBrandTraining } from "./start-brand-training";

const PROFILE_ID = "550e8400-e29b-41d4-a716-446655440000";

const resolveBrandKitProfileId = vi.fn();

vi.mock("@/server/db/repositories/brand-kit", () => {
  // Errors must be real classes so the handler's `instanceof` checks preserve identity.
  // Defined inside the factory so vi.mock hoisting doesn't break initialization order.
  class MockBrandKitAmbiguityError extends Error {
    readonly availableWorkspaces: { id: string; name: string }[] = [];
    constructor(
      message = "Multiple client profiles exist",
      availableWorkspaces: { id: string; name: string }[] = [],
    ) {
      super(message);
      this.name = "BrandKitAmbiguityError";
      this.availableWorkspaces = availableWorkspaces;
    }
  }

  class MockBrandKitProfileNotFoundError extends Error {
    constructor(message = "Client profile not found") {
      super(message);
      this.name = "BrandKitProfileNotFoundError";
    }
  }

  return {
    BrandKitAmbiguityError: MockBrandKitAmbiguityError,
    BrandKitProfileNotFoundError: MockBrandKitProfileNotFoundError,
    resolveBrandKitProfileId: (...args: unknown[]) => resolveBrandKitProfileId(...args),
  };
});

function buildCtx(overrides: Partial<{
  workspaceId: string;
  clientProfileId: string;
  inputSnapshot: Record<string, unknown>;
}> = {}) {
  return {
    workspaceId: "ws-1",
    actionId: "action-1",
    threadId: "thread-1",
    clientProfileId: "profile-from-thread",
    userId: "user-1",
    locale: "pt-BR",
    actionType: "start_brand_training",
    inputSnapshot: {},
    ...overrides,
  };
}

describe("executeStartBrandTraining", () => {
  beforeEach(() => {
    resolveBrandKitProfileId.mockReset();
  });

  it("uses the clientProfileId from the input snapshot and returns its route", async () => {
    const result = await executeStartBrandTraining(
      buildCtx({ inputSnapshot: { clientProfileId: PROFILE_ID } }),
    );

    expect(result.mode).toBe("sync");
    expect(result.route).toBe(
      `/settings?tab=brandTraining&clientProfileId=${PROFILE_ID}`,
    );
    // Resolver is NOT consulted when an explicit id is supplied.
    expect(resolveBrandKitProfileId).not.toHaveBeenCalled();
  });

  it("falls back to the thread's clientProfileId when input omits it", async () => {
    const result = await executeStartBrandTraining(
      buildCtx({ clientProfileId: PROFILE_ID, inputSnapshot: {} }),
    );

    expect(result.route).toBe(
      `/settings?tab=brandTraining&clientProfileId=${PROFILE_ID}`,
    );
    expect(resolveBrandKitProfileId).not.toHaveBeenCalled();
  });

  it("resolves the sole workspace profile when no id is supplied", async () => {
    resolveBrandKitProfileId.mockResolvedValue(PROFILE_ID);

    const result = await executeStartBrandTraining(
      buildCtx({ clientProfileId: "", inputSnapshot: {} }),
    );

    expect(resolveBrandKitProfileId).toHaveBeenCalledWith("ws-1", null);
    expect(result.route).toBe(
      `/settings?tab=brandTraining&clientProfileId=${PROFILE_ID}`,
    );
    expect(result.resultSummary).toMatch(/iniciado/i);
  });

  it("opens the profile selector when no profile exists", async () => {
    resolveBrandKitProfileId.mockRejectedValue(new BrandKitProfileNotFoundError());

    const result = await executeStartBrandTraining(
      buildCtx({ clientProfileId: "", inputSnapshot: {} }),
    );

    expect(result.route).toBe("/settings?tab=brandTraining");
    expect(result.resultSummary).toMatch(/nenhum perfil/i);
  });

  it("opens the profile selector when multiple profiles are ambiguous", async () => {
    resolveBrandKitProfileId.mockRejectedValue(
      new BrandKitAmbiguityError(undefined, [
        { id: "a", name: "Acme" },
        { id: "b", name: "Beta" },
      ]),
    );

    const result = await executeStartBrandTraining(
      buildCtx({ clientProfileId: "", inputSnapshot: {} }),
    );

    expect(result.route).toBe("/settings?tab=brandTraining");
    expect(result.resultSummary).toMatch(/mais de um perfil/i);
  });

  it("rethrows unexpected resolver errors", async () => {
    resolveBrandKitProfileId.mockRejectedValue(new Error("db down"));

    await expect(
      executeStartBrandTraining(
        buildCtx({ clientProfileId: "", inputSnapshot: {} }),
      ),
    ).rejects.toThrow("db down");
  });

  it("rejects invalid inputs (extra fields break strict schema)", async () => {
    await expect(
      executeStartBrandTraining(
        buildCtx({ inputSnapshot: { clientProfileId: PROFILE_ID, rogue: true } }),
      ),
    ).rejects.toThrow(/Invalid start_brand_training inputs/);
  });
});
