import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH } from "./route";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import { CorpusConsentError } from "@/server/human-quality/corpus";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({ user: { id: "user-1" }, workspace: { id: "workspace-1" } }),
  ),
  requireRole: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  deleteEmptyClientProfile: vi.fn(),
  getClientProfile: vi.fn(),
}));

vi.mock("@/server/repositories/assistant-goal", () => ({
  getCorpusConsent: vi.fn(), grantCorpusConsent: vi.fn(), revokeCorpusConsent: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { deleteEmptyClientProfile, getClientProfile } from "@/server/repositories/client-reference";
import { requireRole } from "@/server/auth/workspace";
import { getCorpusConsent, grantCorpusConsent, revokeCorpusConsent } from "@/server/repositories/assistant-goal";

const mockDeleteEmptyClientProfile = vi.mocked(deleteEmptyClientProfile);

describe("DELETE /api/client-profiles/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes an empty profile in the authenticated workspace", async () => {
    mockDeleteEmptyClientProfile.mockResolvedValue({ status: "deleted" });

    const response = await DELETE(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    expect(response.status).toBe(204);
    expect(mockDeleteEmptyClientProfile).toHaveBeenCalledWith("workspace-1", PROFILE_ID);
  });

  it("blocks deletion while the profile owns work or brand assets", async () => {
    mockDeleteEmptyClientProfile.mockResolvedValue({ status: "in_use" });

    const response = await DELETE(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "clientProfileInUse" });
  });

  it("preserves not-found and does not add a role restriction to DELETE", async () => {
    mockDeleteEmptyClientProfile.mockResolvedValue({ status: "not_found" });
    expect((await DELETE(new Request(`http://localhost/api/client-profiles/${PROFILE_ID}`, { method: "DELETE" }), { params: Promise.resolve({ id: PROFILE_ID }) })).status).toBe(404);
    expect(requireRole).not.toHaveBeenCalled();
  });
});

describe("brand corpus consent HTTP", () => {
  const params = Promise.resolve({ id: PROFILE_ID });
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClientProfile).mockResolvedValue({ id: PROFILE_ID, workspaceId: "workspace-1" } as never);
    vi.mocked(requireRole).mockResolvedValue({ role: "owner" });
    vi.mocked(getCorpusConsent).mockResolvedValue(null);
  });

  it("lets a member read the state and tells them who can decide", async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: "member" });
    const response = await GET(new Request(`http://localhost/api/client-profiles/${PROFILE_ID}`), { params });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ purpose: "corpus_between_brands", consent: null, canDecide: false });
    expect(getClientProfile).toHaveBeenCalledWith("workspace-1", PROFILE_ID);
  });

  it.each(["owner", "admin"] as const)("lets %s grant via the brand, using session author and header key", async (role) => {
    vi.mocked(requireRole).mockResolvedValue({ role });
    vi.mocked(grantCorpusConsent).mockResolvedValue({ status: "granted", currentEventId: "event-1" } as never);
    const response = await PATCH(new Request(`http://localhost/api/client-profiles/${PROFILE_ID}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", "Idempotency-Key": "change-1" },
      body: JSON.stringify({ action: "grant", reviewedByUserId: "forged", role: "owner" }),
    }), { params });
    expect(response.status).toBe(200);
    expect(grantCorpusConsent).toHaveBeenCalledWith({ workspaceId: "workspace-1", clientProfileId: PROFILE_ID, reviewedByUserId: "user-1", idempotencyKey: "change-1" });
    await expect(response.json()).resolves.toMatchObject({ consent: { currentEventId: "event-1" } });
  });

  it("refuses a member's mutation", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"));
    const response = await PATCH(new Request(`http://localhost/api/client-profiles/${PROFILE_ID}`, { method: "PATCH", body: JSON.stringify({ action: "grant" }) }), { params });
    expect(response.status).toBe(403);
    expect(grantCorpusConsent).not.toHaveBeenCalled();
    expect(revokeCorpusConsent).not.toHaveBeenCalled();
  });

  it("refuses a brand outside the authenticated workspace", async () => {
    vi.mocked(getClientProfile).mockResolvedValue(null);
    const response = await PATCH(new Request(`http://localhost/api/client-profiles/${PROFILE_ID}`, { method: "PATCH", body: JSON.stringify({ action: "grant" }) }), { params });
    expect(response.status).toBe(404);
    expect(grantCorpusConsent).not.toHaveBeenCalled();
  });

  it("returns persisted state, date and author to the brand's members", async () => {
    vi.mocked(getCorpusConsent).mockResolvedValue({ status: "revoked", updatedAt: "2026-10-01", reviewedByUserId: "owner-2", reviewedByName: "Responsável" } as never);
    const response = await GET(new Request(`http://localhost/api/client-profiles/${PROFILE_ID}`), { params });
    await expect(response.json()).resolves.toMatchObject({ canDecide: true, consent: { status: "revoked", updatedAt: "2026-10-01", reviewedByUserId: "owner-2", reviewedByName: "Responsável" } });
    vi.mocked(getClientProfile).mockResolvedValueOnce(null);
    expect((await GET(new Request(`http://localhost/api/client-profiles/${PROFILE_ID}`), { params })).status).toBe(404);
  });

  it("accepts the alternate key header, generates absent keys and reports conflict", async () => {
    const request = (headers: Record<string, string> = {}) => new Request(`http://localhost/api/client-profiles/${PROFILE_ID}`, { method: "PATCH", headers, body: JSON.stringify({ action: "revoke" }) });
    await PATCH(request({ "X-Idempotency-Key": "brand-change" }), { params });
    expect(revokeCorpusConsent).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "brand-change" }));
    await PATCH(request(), { params });
    await PATCH(request(), { params });
    const keys = vi.mocked(revokeCorpusConsent).mock.calls.slice(1).map(([input]) => input.idempotencyKey);
    expect(new Set(keys).size).toBe(2);
    expect(keys.every((key) => /^[0-9a-f-]{36}$/.test(key!))).toBe(true);
    vi.mocked(revokeCorpusConsent).mockRejectedValueOnce(new CorpusConsentError("Conflict", "idempotency_conflict"));
    const response = await PATCH(request({ "Idempotency-Key": "brand-change" }), { params });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "idempotency_conflict" });
  });

  it("refuses invalid actions without changing the consent", async () => {
    const response = await PATCH(new Request(`http://localhost/api/client-profiles/${PROFILE_ID}`, { method: "PATCH", body: JSON.stringify({ action: "other" }) }), { params });
    expect(response.status).toBe(400);
    expect(grantCorpusConsent).not.toHaveBeenCalled();
    expect(revokeCorpusConsent).not.toHaveBeenCalled();
  });
});
