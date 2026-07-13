/**
 * Gate 4 adapter parity: exercise real HTTP route + Assistente handler
 * against the same mocked application command for every shared migration.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveRefMock = vi.hoisted(() => vi.fn());
const restyleMock = vi.hoisted(() => vi.fn());
const regenerateMock = vi.hoisted(() => vi.fn());
const reviewMock = vi.hoisted(() => vi.fn());
const deliveryMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/application/save-derivation-reference", () => ({
  saveDerivationReference: (...args: unknown[]) => saveRefMock(...args),
}));

vi.mock("@/server/application/restyle-campaign", () => ({
  restyleCampaign: (...args: unknown[]) => restyleMock(...args),
}));

vi.mock("@/server/application/regenerate-derivation", () => ({
  regenerateDerivation: (...args: unknown[]) => regenerateMock(...args),
}));

vi.mock("@/server/application/review-derivation", () => ({
  reviewDerivation: (...args: unknown[]) => reviewMock(...args),
}));

vi.mock("@/server/application/prepare-delivery-package", () => ({
  prepareDeliveryPackage: (...args: unknown[]) => deliveryMock(...args),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn(() => Promise.resolve("pt-BR")),
}));

vi.mock("@/lib/with-rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/beta-analytics/session", () => ({
  getBetaSessionIdFromRequest: vi.fn(() => null),
}));

vi.mock("@/server/beta-analytics/record", () => ({
  recordBetaAnalyticsEvent: vi.fn(() => Promise.resolve({ id: "evt-1" })),
}));

const passthroughContract = {
  inputSchema: {
    safeParse: (input: Record<string, unknown>) => ({
      success: true as const,
      data: input,
    }),
  },
};

vi.mock("@/server/assistant/action-contracts/registry", () => ({
  getActionContract: vi.fn((type: string) => {
    const known = new Set([
      "quick_save_reference",
      "quick_restyle",
      "quick_regenerate",
      "quick_review",
      "quick_package",
    ]);
    return known.has(type) ? passthroughContract : null;
  }),
}));

import { POST as saveReferencePOST } from "@/app/api/derivations/[id]/save-reference/route";
import { POST as restylePOST } from "@/app/api/campaigns/[id]/restyle/route";
import { POST as regeneratePOST } from "@/app/api/derivations/[id]/regenerate/route";
import { PATCH as reviewPATCH } from "@/app/api/derivations/[id]/review/route";
import { POST as deliveryPOST } from "@/app/api/derivations/[id]/delivery-package/route";
import { executeQuickSaveReference } from "@/server/assistant/action-execution/handlers/quick-save-reference";
import { executeQuickRestyle } from "@/server/assistant/action-execution/handlers/quick-restyle";
import {
  executeQuickRegenerate,
  executeQuickReview,
} from "@/server/assistant/action-execution/handlers/quick-regenerate-review";
import { executeQuickPackage } from "@/server/assistant/action-execution/handlers/quick-derivation-jobs";
import type { ActionExecutionContext } from "@/server/assistant/action-execution/types";
import { AssistantActionExecutionError } from "@/server/assistant/action-execution/types";

const profileId = "550e8400-e29b-41d4-a716-446655440001";
const derivationId = "550e8400-e29b-41d4-a716-446655440010";
const baseCreativeId = "550e8400-e29b-41d4-a716-446655440020";

function assistantCtx(
  partial: Partial<ActionExecutionContext> & {
    inputSnapshot: Record<string, unknown>;
    actionType: string;
  }
): ActionExecutionContext {
  return {
    workspaceId: "workspace-1",
    actionId: "action-1",
    threadId: "thread-1",
    clientProfileId: profileId,
    userId: "user-1",
    locale: "pt-BR",
    ...partial,
  };
}

describe("adapter parity: save-reference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("HTTP and Assistente call saveDerivationReference with surface-specific fields", async () => {
    const reference = { id: "ref-1", label: "Winner", kind: "style" };
    saveRefMock.mockResolvedValue({
      ok: true,
      value: {
        reference,
        derivation: { id: derivationId },
        profile: { id: profileId, name: "Acme" },
      },
    });

    const httpRes = await saveReferencePOST(
      new Request("http://localhost/api/derivations/x/save-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientProfileId: profileId,
          label: "Winner",
          kind: "style",
        }),
      }),
      { params: Promise.resolve({ id: derivationId }) }
    );
    expect(httpRes.status).toBe(201);

    const assistant = await executeQuickSaveReference(
      assistantCtx({
        actionType: "quick_save_reference",
        inputSnapshot: {
          derivationId,
          label: "Winner",
          kind: "style",
        },
      })
    );
    expect(assistant.mode).toBe("sync");
    expect(assistant.resultSummary).toContain("ref-1");

    expect(saveRefMock).toHaveBeenCalledTimes(2);
    expect(saveRefMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspaceId: "workspace-1",
        derivationId,
        clientProfileId: profileId,
        label: "Winner",
        kind: "style",
        actorUserId: "user-1",
        evidenceSource: "derivations.save-reference.POST",
      })
    );
    expect(saveRefMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        workspaceId: "workspace-1",
        derivationId,
        clientProfileId: profileId,
        label: "Winner",
        kind: "style",
      })
    );
    expect(saveRefMock.mock.calls[1][0]).not.toHaveProperty("evidenceSource");
  });

  it("maps derivation_not_found equivalently (HTTP 404 / Assistente code)", async () => {
    saveRefMock.mockResolvedValue({
      ok: false,
      error: { code: "derivation_not_found" },
    });

    const httpRes = await saveReferencePOST(
      new Request("http://localhost/api/derivations/x/save-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientProfileId: profileId, label: "X" }),
      }),
      { params: Promise.resolve({ id: derivationId }) }
    );
    expect(httpRes.status).toBe(404);

    await expect(
      executeQuickSaveReference(
        assistantCtx({
          actionType: "quick_save_reference",
          inputSnapshot: { derivationId, label: "X" },
        })
      )
    ).rejects.toMatchObject({
      code: "derivation_not_found",
    } satisfies Partial<AssistantActionExecutionError>);
  });
});

describe("adapter parity: restyle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("HTTP passes campaignId; Assistente passes baseCreativeId — both hit restyleCampaign", async () => {
    restyleMock.mockResolvedValue({
      ok: true,
      value: {
        derivation: { id: "d-restyle" },
        campaignId: "camp-1",
      },
    });

    const httpRes = await restylePOST(
      new Request("http://localhost/api/campaigns/camp-1/restyle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );
    expect(restyleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "camp-1",
        billingAction: "image_derivation",
      })
    );
    expect(httpRes.status).toBe(201);

    restyleMock.mockClear();
    restyleMock.mockResolvedValue({
      ok: true,
      value: {
        derivation: { id: "d-restyle-2" },
        campaignId: "camp-1",
      },
    });

    const assistant = await executeQuickRestyle(
      assistantCtx({
        actionType: "quick_restyle",
        inputSnapshot: {
          baseCreativeId,
          styleReferenceId: "style-1",
        },
      })
    );
    expect(assistant.mode).toBe("async");
    expect(restyleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseCreativeId,
        styleAssetId: "style-1",
        billingAction: "restyling",
        billingIdempotencyKey: "assistant-action:action-1:quick_restyle",
      })
    );
    expect(restyleMock.mock.calls[0][0]).not.toHaveProperty("campaignId");
  });
});

describe("adapter parity: regenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("HTTP and Assistente call regenerateDerivation with surface-specific billing/evidence", async () => {
    regenerateMock.mockResolvedValue({
      ok: true,
      value: {
        derivation: { id: "child-regen" },
        sourceDerivation: { id: derivationId },
        primaryReason: "feedback",
      },
    });

    const httpRes = await regeneratePOST(
      new Request("http://localhost/api/derivations/x/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "make bolder" }),
      }),
      { params: Promise.resolve({ id: derivationId }) }
    );
    expect(httpRes.status).toBe(201);
    const httpBody = await httpRes.json();
    expect(httpBody.derivation.id).toBe("child-regen");

    expect(regenerateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        derivationId,
        feedback: "make bolder",
        userId: "user-1",
        locale: "pt-BR",
        evidenceSource: "derivations.regenerate.POST",
        actorUserId: "user-1",
      })
    );
    expect(regenerateMock.mock.calls[0][0].billingIdempotencyKey).toMatch(
      /^regeneration:/
    );

    regenerateMock.mockClear();
    regenerateMock.mockResolvedValue({
      ok: true,
      value: {
        derivation: { id: "child-regen-2" },
        sourceDerivation: { id: derivationId },
        primaryReason: "feedback",
      },
    });

    const assistant = await executeQuickRegenerate(
      assistantCtx({
        actionType: "quick_regenerate",
        inputSnapshot: {
          derivationId,
          feedback: " make bolder ",
        },
      })
    );
    expect(assistant.mode).toBe("async");
    expect(assistant.jobRef).toEqual({
      kind: "derivation",
      id: "child-regen-2",
    });
    expect(regenerateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        derivationId,
        feedback: "make bolder",
        userId: "user-1",
        locale: "pt-BR",
        billingIdempotencyKey: "assistant-action:action-1:quick_regenerate",
        assistantActionId: "action-1",
        evidenceSource: "assistant.quick_regenerate",
      })
    );
  });

  it("maps derivation_not_found equivalently (HTTP 404 / Assistente code)", async () => {
    regenerateMock.mockResolvedValue({
      ok: false,
      error: { code: "derivation_not_found" },
    });

    const httpRes = await regeneratePOST(
      new Request("http://localhost/api/derivations/x/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: derivationId }) }
    );
    expect(httpRes.status).toBe(404);

    await expect(
      executeQuickRegenerate(
        assistantCtx({
          actionType: "quick_regenerate",
          inputSnapshot: { derivationId },
        })
      )
    ).rejects.toMatchObject({
      code: "derivation_not_found",
    } satisfies Partial<AssistantActionExecutionError>);
  });
});

describe("adapter parity: review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("HTTP and Assistente call reviewDerivation with decision + surface evidence", async () => {
    reviewMock.mockResolvedValue({
      ok: true,
      value: {
        derivation: { id: derivationId, campaignId: "camp-1" },
        campaign: { name: "Camp" },
        effectiveStatus: "approved",
        isOverrideApproval: false,
      },
    });

    const httpRes = await reviewPATCH(
      new Request("http://localhost/api/derivations/x/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "entra" }),
      }),
      { params: Promise.resolve({ id: derivationId }) }
    );
    expect(httpRes.status).toBe(200);
    const httpBody = await httpRes.json();
    expect(httpBody.derivation.id).toBe(derivationId);

    expect(reviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        derivationId,
        decision: "entra",
        actorUserId: "user-1",
        evidenceSource: "derivations.review.PATCH",
      })
    );

    reviewMock.mockClear();
    reviewMock.mockResolvedValue({
      ok: true,
      value: {
        derivation: { id: derivationId, campaignId: "camp-1" },
        campaign: { name: "Camp" },
        effectiveStatus: "rejected",
        isOverrideApproval: false,
      },
    });

    const assistant = await executeQuickReview(
      assistantCtx({
        actionType: "quick_review",
        inputSnapshot: {
          derivationId,
          decision: "nao_entra",
          directionReason: "off brand badly",
        },
      })
    );
    expect(assistant.mode).toBe("sync");
    expect(assistant.resultSummary).toContain("rejected");
    expect(reviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        derivationId,
        decision: "nao_entra",
        directionReason: "off brand badly",
        actorUserId: "user-1",
        evidenceSource: "assistant.quick_review",
      })
    );
  });

  it("maps derivation_not_found equivalently (HTTP 404 / Assistente code)", async () => {
    reviewMock.mockResolvedValue({
      ok: false,
      error: { code: "derivation_not_found" },
    });

    const httpRes = await reviewPATCH(
      new Request("http://localhost/api/derivations/x/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "entra" }),
      }),
      { params: Promise.resolve({ id: derivationId }) }
    );
    expect(httpRes.status).toBe(404);

    await expect(
      executeQuickReview(
        assistantCtx({
          actionType: "quick_review",
          inputSnapshot: { derivationId, decision: "entra" },
        })
      )
    ).rejects.toMatchObject({
      code: "derivation_not_found",
    } satisfies Partial<AssistantActionExecutionError>);
  });
});

describe("adapter parity: delivery package", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("HTTP and Assistente call prepareDeliveryPackage with surface-specific flags", async () => {
    deliveryMock.mockResolvedValue({
      ok: true,
      value: {
        source: { id: derivationId, format: "1:1" },
        requestedFormats: ["1:1", "9:16"],
        readyFormats: ["1:1"],
        queued: [{ id: "child-9-16", format: "9:16" }],
        failed: [],
        skipped: [],
      },
    });

    const httpRes = await deliveryPOST(
      new Request("http://localhost/api/derivations/x/delivery-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formats: ["1:1", "9:16"] }),
      }),
      { params: Promise.resolve({ id: derivationId }) }
    );
    expect(httpRes.status).toBe(200);
    const httpBody = await httpRes.json();
    expect(httpBody.queued).toEqual([{ id: "child-9-16", format: "9:16" }]);

    expect(deliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        sourceDerivationId: derivationId,
        formats: ["1:1", "9:16"],
        userId: "user-1",
        locale: "pt-BR",
      })
    );
    // Panel does not force requireGeneratableFormats.
    expect(deliveryMock.mock.calls[0][0]).not.toHaveProperty(
      "requireGeneratableFormats"
    );

    deliveryMock.mockClear();
    deliveryMock.mockResolvedValue({
      ok: true,
      value: {
        source: { id: derivationId, format: "1:1" },
        requestedFormats: ["9:16"],
        readyFormats: [],
        queued: [{ id: "child-as", format: "9:16" }],
        failed: [],
        skipped: [],
      },
    });

    const assistant = await executeQuickPackage(
      assistantCtx({
        actionType: "quick_package",
        inputSnapshot: {
          sourceDerivationId: derivationId,
          formats: ["9:16"],
        },
      })
    );
    expect(assistant.mode).toBe("async");
    expect(assistant.jobRef).toEqual({
      kind: "derivation",
      id: "child-as",
    });
    expect(deliveryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        sourceDerivationId: derivationId,
        formats: ["9:16"],
        userId: "user-1",
        locale: "pt-BR",
        billingIdempotencyKey: "assistant-action:action-1:quick_package",
        assistantActionId: "action-1",
        requireGeneratableFormats: true,
      })
    );
  });

  it("maps derivation_not_found equivalently (HTTP 404 / Assistente code)", async () => {
    deliveryMock.mockResolvedValue({
      ok: false,
      error: { code: "derivation_not_found" },
    });

    const httpRes = await deliveryPOST(
      new Request("http://localhost/api/derivations/x/delivery-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formats: ["9:16"] }),
      }),
      { params: Promise.resolve({ id: derivationId }) }
    );
    expect(httpRes.status).toBe(404);

    await expect(
      executeQuickPackage(
        assistantCtx({
          actionType: "quick_package",
          inputSnapshot: {
            sourceDerivationId: derivationId,
            formats: ["9:16"],
          },
        })
      )
    ).rejects.toMatchObject({
      code: "derivation_not_found",
    } satisfies Partial<AssistantActionExecutionError>);
  });
});
