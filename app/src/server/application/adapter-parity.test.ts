/**
 * Gate 4 adapter parity: exercise real HTTP route + Assistente handler
 * against the same mocked application command.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveRefMock = vi.hoisted(() => vi.fn());
const restyleMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/application/save-derivation-reference", () => ({
  saveDerivationReference: (...args: unknown[]) => saveRefMock(...args),
}));

vi.mock("@/server/application/restyle-campaign", () => ({
  restyleCampaign: (...args: unknown[]) => restyleMock(...args),
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

vi.mock("@/server/assistant/action-contracts/registry", () => ({
  getActionContract: vi.fn((type: string) => {
    if (type === "quick_save_reference") {
      return {
        inputSchema: {
          safeParse: (input: Record<string, unknown>) => ({
            success: true,
            data: input,
          }),
        },
      };
    }
    if (type === "quick_restyle") {
      return {
        inputSchema: {
          safeParse: (input: Record<string, unknown>) => ({
            success: true,
            data: input,
          }),
        },
      };
    }
    return null;
  }),
}));

import { POST as saveReferencePOST } from "@/app/api/derivations/[id]/save-reference/route";
import { POST as restylePOST } from "@/app/api/campaigns/[id]/restyle/route";
import { executeQuickSaveReference } from "@/server/assistant/action-execution/handlers/quick-save-reference";
import { executeQuickRestyle } from "@/server/assistant/action-execution/handlers/quick-restyle";
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
    // Assistente path must not invent HTTP evidence fields.
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

    // Restyle HTTP also needs rate-limit / getUserLocale path — use minimal body.
    const httpRes = await restylePOST(
      new Request("http://localhost/api/campaigns/camp-1/restyle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "camp-1" }) }
    );
    // May 201 if command ok; check command call regardless.
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
    // Handler must not pass pre-resolved campaignId from a repository call.
    expect(restyleMock.mock.calls[0][0]).not.toHaveProperty("campaignId");
  });
});
