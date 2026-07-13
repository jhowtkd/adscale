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

const saveRefMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/application/save-derivation-reference", () => ({
  saveDerivationReference: (...args: unknown[]) => saveRefMock(...args),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

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

const profileId = "550e8400-e29b-41d4-a716-446655440001";

describe("POST /api/derivations/[id]/save-reference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps derivation_not_found to 404", async () => {
    saveRefMock.mockResolvedValue({
      ok: false,
      error: { code: "derivation_not_found" },
    });

    const res = await POST(
      requestWith({ clientProfileId: profileId, label: "Hero" }),
      { params: paramsWith("missing-id") }
    );
    expect(res.status).toBe(404);
  });

  it("maps derivation_not_approved to 409", async () => {
    saveRefMock.mockResolvedValue({
      ok: false,
      error: { code: "derivation_not_approved" },
    });

    const res = await POST(
      requestWith({ clientProfileId: profileId, label: "Hero" }),
      { params: paramsWith("derivation-id") }
    );
    expect(res.status).toBe(409);
  });

  it("maps derivation_missing_output to 400", async () => {
    saveRefMock.mockResolvedValue({
      ok: false,
      error: { code: "derivation_missing_output" },
    });

    const res = await POST(
      requestWith({ clientProfileId: profileId, label: "Hero" }),
      { params: paramsWith("derivation-id") }
    );
    expect(res.status).toBe(400);
  });

  it("maps derivation_hard_failures to 409", async () => {
    saveRefMock.mockResolvedValue({
      ok: false,
      error: {
        code: "derivation_hard_failures",
        qualityVerdict: "invalid",
        hardFailures: [{ code: "wrong_brand" }],
      },
    });

    const res = await POST(
      requestWith({ clientProfileId: profileId, label: "Winner", kind: "style" }),
      { params: paramsWith("derivation-id") }
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("derivationHardFailures");
  });

  it("delegates success to saveDerivationReference and returns 201", async () => {
    const reference = {
      id: "ref-1",
      assetKey: "derivations/derivation-id/123.png",
      label: "Winner",
      kind: "style",
    };
    saveRefMock.mockResolvedValue({
      ok: true,
      value: { reference, derivation: { id: "derivation-id" }, profile: { id: profileId, name: "Acme" } },
    });

    const res = await POST(
      requestWith({ clientProfileId: profileId, label: "Winner", kind: "style" }),
      { params: paramsWith("derivation-id") }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.reference).toEqual(reference);
    expect(saveRefMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        derivationId: "derivation-id",
        clientProfileId: profileId,
        label: "Winner",
        kind: "style",
        actorUserId: "user-1",
        evidenceSource: "derivations.save-reference.POST",
      })
    );
  });

  it("maps client_profile_not_found to 404", async () => {
    saveRefMock.mockResolvedValue({
      ok: false,
      error: { code: "client_profile_not_found" },
    });

    const res = await POST(
      requestWith({ clientProfileId: profileId, label: "Winner", kind: "style" }),
      { params: paramsWith("derivation-id") }
    );

    expect(res.status).toBe(404);
  });
});
