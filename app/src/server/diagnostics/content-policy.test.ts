import { describe, expect, it, vi, beforeEach } from "vitest";

import type { ResolveContentPolicy } from "./contract";
import {
  DIAGNOSTIC_CONTENT_POLICY_VERSION,
  __resetContentPolicyForTests,
  configureContentPolicyVerifiers,
  getContentCaptureGateStatus,
  isContentCaptureShutdown,
  resolveContentPolicy,
  shutdownContentCapture,
} from "./content-policy";

const WS = "ws-policy-1";

function redactedEnv(): NodeJS.ProcessEnv {
  return {
    OBSERVABILITY_CONTENT_MODE: "redacted",
    OBSERVABILITY_WORKSPACE_ALLOWLIST: ` ${WS} , ws-other `,
  } as NodeJS.ProcessEnv;
}

beforeEach(() => {
  __resetContentPolicyForTests();
});

describe("resolveContentPolicy (#391)", () => {
  it("satisfies the frozen ResolveContentPolicy signature", () => {
    const asContract: ResolveContentPolicy = resolveContentPolicy;
    expect(typeof asContract).toBe("function");
  });

  it("defaults to metadata_only with empty env", async () => {
    await expect(resolveContentPolicy(WS, { env: {} })).resolves.toBe(
      "metadata_only",
    );
  });

  it("returns metadata_only for missing or blank workspace ids", async () => {
    const env = redactedEnv();
    const verifyAccess = vi.fn(async () => true);
    const verifyDeletion = vi.fn(async () => true);
    for (const workspaceId of ["", "   ", "\t\n"]) {
      await expect(
        resolveContentPolicy(workspaceId, { env, verifyAccess, verifyDeletion }),
      ).resolves.toBe("metadata_only");
    }
    expect(verifyAccess).not.toHaveBeenCalled();
    expect(verifyDeletion).not.toHaveBeenCalled();
  });

  it("returns metadata_only when the mode ceiling is metadata_only", async () => {
    const verifyAccess = vi.fn(async () => true);
    const verifyDeletion = vi.fn(async () => true);
    await expect(
      resolveContentPolicy(WS, {
        env: { OBSERVABILITY_WORKSPACE_ALLOWLIST: WS } as NodeJS.ProcessEnv,
        verifyAccess,
        verifyDeletion,
      }),
    ).resolves.toBe("metadata_only");
    expect(verifyAccess).not.toHaveBeenCalled();
    expect(verifyDeletion).not.toHaveBeenCalled();
  });

  it("has no raw mode in v1: unknown modes fail closed to metadata_only", async () => {
    const verifyAccess = vi.fn(async () => true);
    const verifyDeletion = vi.fn(async () => true);
    for (const mode of ["raw", "REDACTED", "full", "verbatim"]) {
      await expect(
        resolveContentPolicy(WS, {
          env: {
            OBSERVABILITY_CONTENT_MODE: mode,
            OBSERVABILITY_WORKSPACE_ALLOWLIST: WS,
          } as NodeJS.ProcessEnv,
          verifyAccess,
          verifyDeletion,
        }),
      ).resolves.toBe("metadata_only");
    }
    expect(verifyAccess).not.toHaveBeenCalled();
    expect(verifyDeletion).not.toHaveBeenCalled();
  });

  it("returns metadata_only for non-allowlisted workspaces without probing", async () => {
    const verifyAccess = vi.fn(async () => true);
    const verifyDeletion = vi.fn(async () => true);
    await expect(
      resolveContentPolicy("ws-not-listed", {
        env: redactedEnv(),
        verifyAccess,
        verifyDeletion,
      }),
    ).resolves.toBe("metadata_only");
    expect(verifyAccess).not.toHaveBeenCalled();
    expect(verifyDeletion).not.toHaveBeenCalled();
  });

  it("returns redacted only after access AND deletion verification pass, in order", async () => {
    const order: string[] = [];
    const verifyAccess = vi.fn(async (_workspaceId: string) => {
      order.push("access");
      return true;
    });
    const verifyDeletion = vi.fn(async (_workspaceId: string) => {
      order.push("deletion");
      return true;
    });
    await expect(
      resolveContentPolicy(WS, {
        env: redactedEnv(),
        verifyAccess,
        verifyDeletion,
      }),
    ).resolves.toBe("redacted");
    expect(verifyAccess).toHaveBeenCalledWith(WS);
    expect(verifyDeletion).toHaveBeenCalledWith(WS);
    expect(order).toEqual(["access", "deletion"]);
  });

  it("short-circuits: failed access verification never runs deletion verification", async () => {
    const verifyAccess = vi.fn(async () => false);
    const verifyDeletion = vi.fn(async () => true);
    await expect(
      resolveContentPolicy(WS, {
        env: redactedEnv(),
        verifyAccess,
        verifyDeletion,
      }),
    ).resolves.toBe("metadata_only");
    expect(verifyAccess).toHaveBeenCalledWith(WS);
    expect(verifyDeletion).not.toHaveBeenCalled();
  });

  it("returns metadata_only when deletion verification fails", async () => {
    await expect(
      resolveContentPolicy(WS, {
        env: redactedEnv(),
        verifyAccess: async () => true,
        verifyDeletion: async () => false,
      }),
    ).resolves.toBe("metadata_only");
  });

  it("treats throwing verifiers as verification failure, never throws", async () => {
    await expect(
      resolveContentPolicy(WS, {
        env: redactedEnv(),
        verifyAccess: async () => {
          throw new Error("audit down");
        },
        verifyDeletion: async () => true,
      }),
    ).resolves.toBe("metadata_only");
    await expect(
      resolveContentPolicy(WS, {
        env: redactedEnv(),
        verifyAccess: async () => true,
        verifyDeletion: async () => {
          throw new Error("remote down");
        },
      }),
    ).resolves.toBe("metadata_only");
  });

  it("uses module-configured verifiers when per-call deps are absent", async () => {
    configureContentPolicyVerifiers({
      verifyAccess: async () => true,
      verifyDeletion: async () => true,
    });
    await expect(resolveContentPolicy(WS, { env: redactedEnv() })).resolves.toBe(
      "redacted",
    );
  });

  it("denies redacted while verifiers are unwired (the blocked-gate state)", async () => {
    await expect(resolveContentPolicy(WS, { env: redactedEnv() })).resolves.toBe(
      "metadata_only",
    );
  });
});

describe("content capture shutdown (#391)", () => {
  it("is not shut down by default", () => {
    expect(isContentCaptureShutdown()).toBe(false);
  });

  it("forces metadata_only and skips verification after shutdown", async () => {
    shutdownContentCapture();
    expect(isContentCaptureShutdown()).toBe(true);
    const verifyAccess = vi.fn(async () => true);
    const verifyDeletion = vi.fn(async () => true);
    await expect(
      resolveContentPolicy(WS, {
        env: redactedEnv(),
        verifyAccess,
        verifyDeletion,
      }),
    ).resolves.toBe("metadata_only");
    expect(verifyAccess).not.toHaveBeenCalled();
    expect(verifyDeletion).not.toHaveBeenCalled();
  });

  it("shutdown is idempotent and never throws", () => {
    shutdownContentCapture();
    expect(() => shutdownContentCapture()).not.toThrow();
    expect(isContentCaptureShutdown()).toBe(true);
  });
});

describe("content capture gate status (#391)", () => {
  it("pins policy version v1", () => {
    expect(DIAGNOSTIC_CONTENT_POLICY_VERSION).toBe("v1");
  });

  it("reports blocked with reasons under default env", () => {
    const status = getContentCaptureGateStatus({ env: {} });
    expect(status.blocked).toBe(true);
    expect(status.mode).toBe("metadata_only");
    expect(status.allowlistedWorkspaces).toEqual([]);
    expect(status.reasons.length).toBeGreaterThan(0);
    expect(status.policyVersion).toBe(DIAGNOSTIC_CONTENT_POLICY_VERSION);
  });

  it("reports blocked while verifiers are unwired even with redacted config", () => {
    const status = getContentCaptureGateStatus({ env: redactedEnv() });
    expect(status.blocked).toBe(true);
    expect(status.mode).toBe("redacted");
    expect(status.allowlistedWorkspaces).toContain(WS);
    expect(status.reasons.join(" ")).toMatch(/verif/i);
  });

  it("reports unblocked only with mode + allowlist + wired verifiers + no shutdown", () => {
    configureContentPolicyVerifiers({
      verifyAccess: async () => true,
      verifyDeletion: async () => true,
    });
    const status = getContentCaptureGateStatus({ env: redactedEnv() });
    expect(status.blocked).toBe(false);
    expect(status.reasons).toEqual([]);
  });

  it("reports blocked after shutdown regardless of config", () => {
    configureContentPolicyVerifiers({
      verifyAccess: async () => true,
      verifyDeletion: async () => true,
    });
    shutdownContentCapture();
    const status = getContentCaptureGateStatus({ env: redactedEnv() });
    expect(status.blocked).toBe(true);
    expect(status.reasons.join(" ")).toMatch(/shutdown/i);
  });
});
