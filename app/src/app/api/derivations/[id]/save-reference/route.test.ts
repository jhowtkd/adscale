import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  createClientReference: vi.fn(),
  getClientProfile: vi.fn(() => Promise.resolve({ id: "profile-id", workspaceId: "workspace-1" })),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getDerivationById } from "@/server/repositories/derivation";
import { createClientReference, getClientProfile } from "@/server/repositories/client-reference";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockCreateClientReference = vi.mocked(createClientReference);
const mockGetClientProfile = vi.mocked(getClientProfile);

function requestWith(body: unknown): Request {
  return new Request(
    "http://localhost/api/derivations/derivation-id/save-reference",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function paramsWith(id: string) {
  return Promise.resolve({ id });
}

describe("POST /api/derivations/[id]/save-reference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects missing derivation", async () => {
    mockGetDerivationById.mockResolvedValue(null as unknown);

    const res = await POST(requestWith({ clientProfileId: "550e8400-e29b-41d4-a716-446655440000", label: "Hero" }), {
      params: paramsWith("missing-id"),
    });
    expect(res.status).toBe(404);
  });

  it("rejects non-approved derivation", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "completed",
      outputKey: "assets/out.png",
      workspaceId: "workspace-1",
      campaignId: "campaign-id",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(requestWith({ clientProfileId: "550e8400-e29b-41d4-a716-446655440000", label: "Hero" }), {
      params: paramsWith("derivation-id"),
    });
    expect(res.status).toBe(409);
  });

  it("rejects derivation without outputKey", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: null,
      workspaceId: "workspace-1",
      campaignId: "campaign-id",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(requestWith({ clientProfileId: "550e8400-e29b-41d4-a716-446655440000", label: "Hero" }), {
      params: paramsWith("derivation-id"),
    });
    expect(res.status).toBe(400);
  });

  it("creates a client reference using the derivation outputKey", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/derivation-id/123.png",
      workspaceId: "workspace-1",
      campaignId: "campaign-id",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const reference = {
      id: "ref-1",
      assetKey: "derivations/derivation-id/123.png",
      label: "Winner",
      kind: "style",
      clientProfileId: "profile-id",
      sourceDerivationId: "derivation-id",
    };
    mockCreateClientReference.mockResolvedValue(
      reference as Awaited<ReturnType<typeof createClientReference>>
    );

    const res = await POST(
      requestWith({ clientProfileId: "550e8400-e29b-41d4-a716-446655440001", label: "Winner", kind: "style" }),
      { params: paramsWith("derivation-id") }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.reference).toEqual(reference);
    expect(mockCreateClientReference).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({
        clientProfileId: "550e8400-e29b-41d4-a716-446655440001",
        assetKey: "derivations/derivation-id/123.png",
        label: "Winner",
        kind: "style",
        sourceDerivationId: "derivation-id",
      })
    );
  });

  it("rejects profile outside workspace", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      outputKey: "derivations/derivation-id/123.png",
      workspaceId: "workspace-1",
      campaignId: "campaign-id",
    } as Awaited<ReturnType<typeof getDerivationById>>);
    mockGetClientProfile.mockResolvedValueOnce(null as unknown);

    const res = await POST(
      requestWith({ clientProfileId: "550e8400-e29b-41d4-a716-446655440001", label: "Winner", kind: "style" }),
      { params: paramsWith("derivation-id") }
    );

    expect(res.status).toBe(404);
    expect(mockCreateClientReference).not.toHaveBeenCalled();
  });
});
